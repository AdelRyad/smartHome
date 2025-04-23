#!/usr/bin/env python
import logging
from socketserver import TCPServer
from collections import defaultdict
import threading
import struct

from umodbus import conf
from umodbus.server.tcp import RequestHandler, get_server
from umodbus.utils import log_to_stream

# Set up logging for uModbus.
log_to_stream(level=logging.DEBUG)

# Allow signed values.
conf.SIGNED_VALUES = True

# Data stores for different register types.
coils = defaultdict(lambda: 0)
discrete_inputs = defaultdict(lambda: 0)
holding_registers = defaultdict(lambda: 0)
input_registers = defaultdict(lambda: 0)

# -------------------------------------------------------------------
# Helper Functions for Float Conversions (IEEE754 binary32)
# -------------------------------------------------------------------
def float_to_modbus_registers(value):
    """
    Convert a Python float into two 16-bit register values.
    The conversion packs the float into 4 bytes (big-endian) and unpacks
    it into two unsigned shorts.
    """
    packed = struct.pack('>f', value)
    reg_high, reg_low = struct.unpack('>HH', packed)
    return reg_high, reg_low

def modbus_registers_to_float(reg_high, reg_low):
    """
    Convert two 16-bit register values (big-endian) back to a float.
    """
    packed = struct.pack('>HH', reg_high, reg_low)
    return struct.unpack('>f', packed)[0]

# -------------------------------------------------------------------
# Set up Modbus TCP Server (using non-privileged port 1502)
# -------------------------------------------------------------------
TCPServer.allow_reuse_address = True
app = get_server(TCPServer, ('192.168.1.2', 502), RequestHandler)

# =============================================================================
# Modbus Read Routes
# =============================================================================

# Function Code 1: Read Coils
@app.route(slave_ids=[1], function_codes=[1], addresses=list(range(0, 50)))
def read_coils(slave_id, function_code, address):
    return coils[address]

# Function Code 2: Read Discrete Inputs
@app.route(slave_ids=[1], function_codes=[2], addresses=list(range(0, 50)))
def read_discrete_inputs(slave_id, function_code, address):
    return discrete_inputs[address]

# Function Code 3: Read Holding Registers
@app.route(slave_ids=[1], function_codes=[3], addresses=list(range(0, 50)))
def read_holding_registers(slave_id, function_code, address):
    return holding_registers[address]

# Function Code 4: Read Input Registers
@app.route(slave_ids=[1], function_codes=[4], addresses=list(range(0, 50)))
def read_input_registers(slave_id, function_code, address):
    return input_registers[address]

# =============================================================================
# Modbus Write Routes
# =============================================================================

# Function Code 5: Write Single Coil
@app.route(slave_ids=[1], function_codes=[5], addresses=list(range(0, 50)))
def write_single_coil(slave_id, function_code, address, value):
    coils[address] = value

# Function Code 6: Write Single Holding Register
@app.route(slave_ids=[1], function_codes=[6], addresses=list(range(0, 50)))
def write_single_holding_register(slave_id, function_code, address, value):
    holding_registers[address] = value

# Function Code 15: Write Multiple Coils
@app.route(slave_ids=[1], function_codes=[15], addresses=list(range(0, 50)))
def write_multiple_coils(slave_id, function_code, address, values):
    for offset, val in enumerate(values):
        coils[address + offset] = val

# Function Code 16: Write Multiple Holding Registers
@app.route(slave_ids=[1], function_codes=[16], addresses=list(range(0, 50)))
def write_multiple_registers(slave_id, function_code, address, values):
    for offset, val in enumerate(values):
        holding_registers[address + offset] = val

# =============================================================================
# Command-Line Interface (CLI) for Register Access
# =============================================================================

def cli_loop():
    """
    A simple CLI to read and write register values.
    For holding and input registers, if a float value is provided it is converted
    into two registers (address and address+1) storing the float as hex (IEEE754 binary32).
    Two extra 'readf' commands are provided:
      * 'readf holding <address>' - decodes two consecutive holding registers into a float.
      * 'readf input <address>' - decodes two consecutive input registers into a float.
    """
    print("CLI started. Type 'help' for commands, 'exit' or 'quit' to stop CLI.")
    while True:
        try:
            cmd = input(">> ").strip()
        except EOFError:
            break
        if not cmd:
            continue

        parts = cmd.split()
        command = parts[0].lower()

        if command in ["exit", "quit"]:
            print("Exiting CLI...")
            break

        elif command == "help":
            print("Available commands:")
            print("  read <register_type> <address>")
            print("    - Read a single register value")
            print("  write <register_type> <address> <value>")
            print("    - Write a value to a register. For 'holding' and 'input' registers,")
            print("      a float value will be converted into two registers (addr and addr+1).")
            print("  readf holding <address>  - Decode two consecutive holding registers as a float.")
            print("  readf input <address>    - Decode two consecutive input registers as a float.")
            print("  exit or quit             - Exit the CLI (server remains running)")
            continue

        elif command == "read":
            if len(parts) != 3:
                print("Usage: read <register_type> <address>")
                continue

            reg_type = parts[1].lower()
            try:
                address = int(parts[2])
            except ValueError:
                print("Error: Address must be an integer.")
                continue

            if reg_type == "coil":
                print(f"Coil[{address}] = {coils[address]}")
            elif reg_type == "discrete":
                print(f"Discrete Input[{address}] = {discrete_inputs[address]}")
            elif reg_type == "holding":
                print(f"Holding Register[{address}] = {holding_registers[address]}")
            elif reg_type == "input":
                print(f"Input Register[{address}] = {input_registers[address]}")
            else:
                print("Error: Unknown register type. Use: coil, discrete, holding, or input.")

        elif command == "readf":
            # Handle reading float from holding or input registers.
            if len(parts) != 3:
                print("Usage: readf <register_type> <address>")
                continue

            reg_type = parts[1].lower()
            try:
                address = int(parts[2])
            except ValueError:
                print("Error: Address must be an integer.")
                continue

            if reg_type == "holding":
                reg_high = holding_registers[address]
                reg_low = holding_registers[address + 1]
                float_val = modbus_registers_to_float(reg_high, reg_low)
                print(f"Holding Registers[{address}] and [{address+1}] as float = {float_val}")
            elif reg_type == "input":
                reg_high = input_registers[address]
                reg_low = input_registers[address + 1]
                float_val = modbus_registers_to_float(reg_high, reg_low)
                print(f"Input Registers[{address}] and [{address+1}] as float = {float_val}")
            else:
                print("Error: readf supported only for 'holding' or 'input' registers.")

        elif command == "write":
            if len(parts) != 4:
                print("Usage: write <register_type> <address> <value>")
                continue

            reg_type = parts[1].lower()
            try:
                address = int(parts[2])
            except ValueError:
                print("Error: Address must be an integer.")
                continue

            # Determine whether the provided value is a float or an integer.
            try:
                if '.' in parts[3]:
                    value = float(parts[3])
                    is_float = True
                else:
                    value = int(parts[3])
                    is_float = False
            except ValueError:
                try:
                    value = float(parts[3])
                    is_float = True
                except ValueError:
                    print("Error: Value must be a float or integer.")
                    continue

            if reg_type == "coil":
                coils[address] = value
                print(f"Set coil[{address}] = {value}")

            elif reg_type == "discrete":
                discrete_inputs[address] = value
                print(f"Set discrete input[{address}] = {value}")

            elif reg_type == "holding":
                if is_float:
                    reg_high, reg_low = float_to_modbus_registers(value)
                    holding_registers[address] = reg_high
                    holding_registers[address + 1] = reg_low
                    print(f"Set holding registers[{address}] and [{address+1}] from float {value} (hex: {reg_high:04X}, {reg_low:04X})")
                else:
                    holding_registers[address] = value
                    print(f"Set holding register[{address}] = {value}")

            elif reg_type == "input":
                if is_float:
                    reg_high, reg_low = float_to_modbus_registers(value)
                    input_registers[address] = reg_high
                    input_registers[address + 1] = reg_low
                    print(f"Set input registers[{address}] and [{address+1}] from float {value} (hex: {reg_high:04X}, {reg_low:04X})")
                else:
                    input_registers[address] = value
                    print(f"Set input register[{address}] = {value}")
            else:
                print("Error: Unknown register type. Use: coil, discrete, holding, or input.")
        else:
            print("Unknown command. Type 'help' for available commands.")

# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == '__main__':
    # Start the CLI loop in a separate thread.
    cli_thread = threading.Thread(target=cli_loop, daemon=True)
    cli_thread.start()

    try:
        print("Modbus server running on localhost:502")
        app.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down server.")
    finally:
        app.shutdown()
        app.server_close()
