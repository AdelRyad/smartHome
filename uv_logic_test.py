import argparse
import time
import struct
from pymodbus.client import ModbusTcpClient

client = None

ADDR_POS = 0
SIZE_POS = 1

UV_RESET_ADDRESSES = {
    "1": [1,2],
    "2": [3,2],
    "3": [5,2],
    "4": [7,2]
}

UV_CLEAN_STATUS_ADDRESSES = {
    "1": [1,1],
    "2": [5,1],
    "3": [9,1],
    "4": [13,1],
}

# Used to reset the Clear Hours Status
UV_CLEAN_RESET_ADDRESSES = {
    "1": [11,1],
    "2": [13,1],
    "3": [15,1],
    "4": [17,1],
    "STATUS": [25,1]
}

UV_CLEAN_RUN_HOURS = {
    "1": [24,2],
    "2": [26,2],
    "3": [28,2],
    "4": [30,2]

}

UV_LIFE_STATUS_ADDRESSES = {
    "1": [3,1],
    "2": [7,1],
    "3": [11,1],
    "4": [15,1]
}

SENSOR_ADDRESSES = {
    "DPS": [17,1],
    "LIMIT_SWITCH": [19,1]
}

CT_ADDRESSES = {
    "AMPS": [18,4],
    "LIGHT_COUNT": [22,4]
}

UV_RUN_HOURS = {
    "1": [2,4],
    "2": [6,4],
    "3": [10,4],
    "4": [14,4]
}

POWER = {
    "STATUS": [21,1],
    "CONTROL": [9,1]
}

CONFIGURE_LIFE = {
    "LAMP": [6,4],
    "CLEAN": [2,4]
}


def convert_data(data, data_type):
    if data_type == "float32" and len(data) >= 2:
        return struct.unpack('>f', struct.pack('>HH', data[0], data[1]))[0]
    elif data_type == "float16" and len(data) >= 1:
        return struct.unpack('>e', struct.pack('>H', data[0]))[0]
    elif data_type == "int16" and len(data) >= 1:
        return data[0]
    elif data_type == "int32" and len(data) >= 2:
        return struct.unpack('>i', struct.pack('>HH', data[0], data[1]))[0]
    elif data_type == "boolean" and len(data) >= 1:
        return bool(data[0])
    return data

def read_coil(client, address, count=1):
    response = client.read_coils(address, count)
    if response.isError():
        print(f"Error reading coil at {address}")
    else:
        print(f"Coil[{address}]: {response.bits}")

def write_coil(client, address, value):
    response = client.write_coil(address, value)
    if response.isError():
        print(f"Error writing coil at {address}")
    else:
        print(f"Successfully wrote {value} to Coil[{address}]")

def read_discrete(client, address, count=1):
    response = client.read_discrete_inputs(address = address, count = count)
    if response.isError():
        print(f"Error reading discrete input at {address}")
    else:
        print(f"Discrete[{address}]: {response.bits}")

def read_input(client, address, count=1, data_type="int16", continuous=False, interval=1):
    while True:
        response = client.read_input_registers(address = address, count = count)
        if response.isError():
            print(f"Error reading input register at {address}")
        else:
            converted_data = convert_data(response.registers, data_type)
            print(f"Input[{address}]: {converted_data}")
        if not continuous:
            break
        time.sleep(interval)

# def write_holding(client, address, value):
#     response = client.write_register(address, value)
#     if response.isError():
#         print(f"Error writing holding register at {address}")
#     else:
#         print(f"Successfully wrote {value} to Holding[{address}]")

def write_holding(client, address, value, data_type="int16"):
    if data_type == "float32":
        # Convert float32 to two 16-bit registers
        packed = struct.pack('>f', value)
        registers = struct.unpack('>HH', packed)
        response = client.write_registers(address, registers)
    else:
        response = client.write_register(address, int(value))

    if response.isError():
        print(f"Error writing holding register at {address}")
    else:
        print(f"Successfully wrote {value} to Holding[{address}]")

def read_holding(client, address, count=1, data_type="int16"):
    response = client.read_holding_registers(address = address, count = count)
    if response.isError():
        print(f"Error reading holding register at {address}")
    else:
        converted_data = convert_data(response.registers, data_type)
        print(f"Holding[{address}]: {converted_data}")



# Reset statuses: ------------------
def rest_UV_hours(lamp_ID):
    tmp_lamp_id = str(lamp_ID)
    addr = UV_RESET_ADDRESSES[tmp_lamp_id][ADDR_POS]
    data_size = UV_RESET_ADDRESSES[tmp_lamp_id][SIZE_POS]

    write_coil(client, addr, True)
    time.sleep(0.5)
    write_coil(client, addr, False)

def reset_UV_clean_status(lamp_ID):
    tmp_lamp_id = str(lamp_ID)
    addr = UV_CLEAN_RESET_ADDRESSES[tmp_lamp_id][ADDR_POS]
    data_size = UV_CLEAN_RESET_ADDRESSES[tmp_lamp_id][SIZE_POS]

    write_coil(client, addr, True)
    time.sleep(0.5)
    write_coil(client, addr, False)

# -----------------------------------

# Power Functions: ------------------
def toggle_power(status):
    addr = POWER["CONTROL"][ADDR_POS]
    data_size = POWER["CONTROL"][SIZE_POS]

    write_coil(client, addr, status)


def turn_ON_power():
    print("\nTurn ON Controller")
    toggle_power(True)
    time.sleep(5)

def turn_OFF_power():
    print("\nTurn OFF Controller")
    toggle_power(False)
    time.sleep(5)

def read_power_status():
    print("\nRead Power Status")
    addr = POWER["STATUS"][ADDR_POS]
    data_size = POWER["STATUS"][SIZE_POS]

    read_discrete(client = client, address = addr, count = data_size)

# -----------------------------------


# Read statuses: ----------

def read_UV_clean_status(lamp_ID):
    tmp_lamp_id = str(lamp_ID)
    addr = UV_CLEAN_STATUS_ADDRESSES[tmp_lamp_id][ADDR_POS]
    data_size = UV_CLEAN_STATUS_ADDRESSES[tmp_lamp_id][SIZE_POS]

    read_discrete(client, addr, data_size)

def read_UV_clean_hours(lamp_ID):
    tmp_lamp_id = str(lamp_ID)
    addr = UV_CLEAN_RUN_HOURS[tmp_lamp_id][ADDR_POS]
    data_size = UV_CLEAN_RUN_HOURS[tmp_lamp_id][SIZE_POS]

    read_input(client, addr, data_size, data_type = "float32")

def read_UV_combined_clean_status():
    print("\nRead Combined Lamp Clean Status")
    addr = UV_CLEAN_RESET_ADDRESSES["STATUS"][ADDR_POS]
    data_size = UV_CLEAN_RESET_ADDRESSES["STATUS"][SIZE_POS]

    read_discrete(client, addr, data_size)

def read_UV_life_status(lamp_ID):
    tmp_lamp_id = str(lamp_ID)
    addr = UV_LIFE_STATUS_ADDRESSES[tmp_lamp_id][ADDR_POS]
    data_size = UV_LIFE_STATUS_ADDRESSES[tmp_lamp_id][SIZE_POS]

    read_discrete(client, addr, data_size)

def read_UV_lamp_hours(lamp_ID):
    tmp_lamp_id = str(lamp_ID)
    addr = UV_RUN_HOURS[tmp_lamp_id][ADDR_POS]
    data_size = UV_RUN_HOURS[tmp_lamp_id][SIZE_POS]

    read_input(client, addr, data_size, data_type = "float32")

def read_dps_status():
    addr = SENSOR_ADDRESSES["DPS"][ADDR_POS]
    data_size = SENSOR_ADDRESSES["DPS"][ADDR_POS]

    read_discrete(client, addr, data_size)

def read_limit_switch_status():
    addr = SENSOR_ADDRESSES["LIMIT_SWITCH"][ADDR_POS]
    data_size = SENSOR_ADDRESSES["LIMIT_SWITCH"][ADDR_POS]

    read_discrete(client, addr, data_size)

def read_lamps_online():
    addr = CT_ADDRESSES["LIGHT_COUNT"][ADDR_POS]
    data_size = CT_ADDRESSES["LIGHT_COUNT"][SIZE_POS]

    read_input(client, addr, data_size, data_type = "float32")

def read_CT():
    addr = CT_ADDRESSES["AMPS"][ADDR_POS]
    data_size = CT_ADDRESSES["AMPS"][SIZE_POS]

    read_input(client, addr, data_size, data_type = "float32")

# -----------------------------------

# Configure statuses: ---------------

def read_lamp_setpoint ():
    addr = CONFIGURE_LIFE["LAMP"][ADDR_POS]
    data_size = CONFIGURE_LIFE["LAMP"][SIZE_POS]

    read_holding(client, addr, data_size, data_type = "float32")

def configure_lamp_hours (hours):
    addr = CONFIGURE_LIFE["LAMP"][ADDR_POS]

    write_holding(client, addr, hours, data_type = "float32")

def configure_cleaning_hours(hours):
    addr = CONFIGURE_LIFE["CLEAN"][ADDR_POS]

    write_holding(client, addr, hours, data_type = "float32")

def read_clean_setpoint ():
    addr = CONFIGURE_LIFE["CLEAN"][ADDR_POS]
    data_size = CONFIGURE_LIFE["CLEAN"][SIZE_POS]

    read_holding(client, addr, data_size, data_type = "float32")

# -----------------------------------

def read_All_UV_Lamp_Hours():
    print("\nRead Lamp hours")
    read_UV_lamp_hours(1)
    read_UV_lamp_hours(2)
    read_UV_lamp_hours(3)
    read_UV_lamp_hours(4)

def reset_and_read_all_UV_lamp_hours():
    rest_UV_hours(1)
    rest_UV_hours(2)
    rest_UV_hours(3)
    rest_UV_hours(4)
    time.sleep(1)
    read_UV_lamp_hours(1)
    read_UV_lamp_hours(2)
    read_UV_lamp_hours(3)
    read_UV_lamp_hours(4)

def read_and_write_lamp_hours(lamp_hours):
    print("\nRead current Lamp hours setpoint")
    read_lamp_setpoint()
    print("\nWrite Lamp hours setpoint")
    configure_lamp_hours(lamp_hours)
    time.sleep(3)
    print("\nRead current Lamp hours setpoint")
    read_lamp_setpoint()

def read_and_write_clean_hours(clean_hours):
    print("\nRead current Clean hours setpoint")
    read_clean_setpoint()
    print("\nWrite Clean hours setpoint")
    configure_cleaning_hours(clean_hours)
    time.sleep(3)
    print("\nRead current Clean hours setpoint")
    read_clean_setpoint()

def read_all_UV_clean_status():
    print("\nRead UV Clean status")
    read_UV_clean_status(1)
    read_UV_clean_status(2)
    read_UV_clean_status(3)
    read_UV_clean_status(4)

def read_all_UV_clean_hours():
    print("\nRead UV Clean Hours")
    read_UV_clean_hours(1)
    read_UV_clean_hours(2)
    read_UV_clean_hours(3)
    read_UV_clean_hours(4)

def reset_all_UV_clean_status():
    reset_UV_clean_status(1)
    reset_UV_clean_status(2)
    reset_UV_clean_status(3)
    reset_UV_clean_status(4)

def read_all_sensors():
    print("\nRead DPS Status")
    read_dps_status()
    print("\nRead Limit Swtich Status")
    read_limit_switch_status()
    print("\nRead Lamps Online")
    read_lamps_online()
    print("\nRead CT (Amps)")
    read_CT()

def test_function():
    global client

    # Power Test
    # turn_OFF_power()
    turn_ON_power()
    
    read_power_status()
    
    # Read Lamp hour
    read_All_UV_Lamp_Hours()

    # Read Combined Lamp Clean status
    read_UV_combined_clean_status()

    # Reset & Read Lamp Hours
    # reset_and_read_all_UV_lamp_hours()


    #Read / Write Lamp Configuration
    # read_and_write_lamp_hours(8000)

    #Read / Write Clean Configuration
    # read_and_write_clean_hours(1000)


    # Read UV Clean Status
    read_all_UV_clean_status()


    # Read UV Clean Hours
    read_all_UV_clean_hours()


    # Reset UV Clean Hours
    # reset_all_UV_clean_status()

    # Read Sensors
    read_all_sensors()


def main():
    global client

    parser = argparse.ArgumentParser(description="Modbus Client")
    parser.add_argument("--host", type=str, required=True, help="Modbus Server IP Address")
    parser.add_argument("--port", type=int, default=502, help="Modbus Server Port")
    # # parser.add_argument("--function", type=str, required=True, choices=[
    # #     "read_coil", "write_coil", "read_discrete", "read_input", "write_holding", "read_holding"
    # # ], help="Modbus function to execute")
    # parser.add_argument("--function", type=str, required=True, choices=[
    #     "rest_UV_hours", "reset_UV_clean_status", "toggle_power", "turn_ON_power", "turn_OFF_power", "read_power_status", "read_UV_clean_status", "read_UV_life_status", "read_dps_status", "read_limit_switch_status", "read_lamps_online", "read_CT", "configure_lamp_hours ", "configure_cleaning_hours"
    # ], help="UV function to execute")
    # parser.add_argument("--address", type=int, required=True, help="Register/Coil Address")
    # parser.add_argument("--value", type=int, help="Value to write (if applicable)")
    # parser.add_argument("--count", type=int, default=1, help="Number of registers/coils to read")
    # parser.add_argument("--data_type", type=str, choices=["float32", "float16", "int16", "int32", "boolean"], default="int16", help="Data type conversion")
    # parser.add_argument("--continuous", action="store_true", help="Enable continuous read mode")
    # parser.add_argument("--interval", type=int, default=1, help="Interval for continuous mode")

    args = parser.parse_args()
    client = ModbusTcpClient(args.host, port=args.port)
    client.connect()
    test_function()
    # read_UV_lamp_hours(1)


    # try:
    #     if args.function == "read_coil":
    #         read_coil(client, args.address, args.count)
    #     elif args.function == "write_coil":
    #         if args.value is None:
    #             print("Value required for write_coil")
    #         else:
    #             write_coil(client, args.address, bool(args.value))
    #     elif args.function == "read_discrete":
    #         read_discrete(client, args.address, args.count)
    #     elif args.function == "read_input":
    #         read_input(client, args.address, args.count, args.data_type, args.continuous, args.interval)
    #     elif args.function == "write_holding":
    #         if args.value is None:
    #             print("Value required for write_holding")
    #         else:
    #             write_holding(client, args.address, args.value)
    #     elif args.function == "read_holding":
    #         read_holding(client, args.address, args.count, args.data_type)
    # finally:
    #     client.close()

if __name__ == "__main__":
    main()
