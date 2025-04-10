import TcpSocket from 'react-native-tcp-socket';
import {Buffer} from 'buffer'; // Make sure to import Buffer

// --- Configuration ---
const MODBUS_UNIT_ID = 1;

// --- Helper Functions (Updated for FC16 Write Multiple Registers) ---

/**
 * Creates a Modbus TCP request buffer (MBAP Header + PDU).
 * Addresses passed to this function should be 0-based.
 */
const createModbusRequest = (
  unitId: number, // Modbus unit ID
  functionCode: number, // Modbus function code
  startAddress: number, // Register address (0-based)
  quantity: number, // Number of items (coils/registers) OR the value for single writes (FC5, FC6)
  writeData?: Buffer, // Data buffer for multiple write operations (FC15, FC16)
): Buffer => {
  let pdu: Buffer;

  if (
    functionCode === 0x01 ||
    functionCode === 0x02 ||
    functionCode === 0x03 ||
    functionCode === 0x04
  ) {
    // Read Coils/Inputs/Registers: FC(1), StartAddr(2), Quantity(2)
    pdu = Buffer.alloc(5);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3);
  } else if (functionCode === 0x05) {
    // Write Single Coil
    // FC(1), Addr(2), Value(2 - 0xFF00/0x0000)
    pdu = Buffer.alloc(5);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3); // quantity holds the value
  } else if (functionCode === 0x06) {
    // Write Single Register
    // FC(1), Addr(2), Value(2)
    pdu = Buffer.alloc(5);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3); // quantity holds the value
  } else if (functionCode === 0x0f && writeData) {
    // Write Multiple Coils
    // FC(1), StartAddr(2), QuantityCoils(2), ByteCount(1), Data(...)
    const byteCount = writeData.length;
    pdu = Buffer.alloc(6 + byteCount);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3); // quantity is number of coils
    pdu.writeUInt8(byteCount, 5);
    writeData.copy(pdu, 6);
  } else if (functionCode === 0x10 && writeData) {
    // Write Multiple Registers
    // FC(1), StartAddr(2), QuantityRegs(2), ByteCount(1), Data(...)
    const byteCount = writeData.length;
    pdu = Buffer.alloc(6 + byteCount);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3); // quantity is number of registers
    pdu.writeUInt8(byteCount, 5);
    writeData.copy(pdu, 6);
  } else {
    console.error(
      `Unsupported Modbus request structure for func: ${functionCode} / data: ${writeData}`,
    );
    // Minimal PDU to avoid crash, likely results in Modbus exception
    pdu = Buffer.from([functionCode]);
  }

  // MBAP Header: TransID(2), ProtoID(2), Len(2), UnitID(1)
  const mbapHeader = Buffer.alloc(7);
  mbapHeader.writeUInt16BE(Math.floor(Math.random() * 65535), 0); // Transaction ID
  mbapHeader.writeUInt16BE(0x0000, 2); // Protocol ID
  mbapHeader.writeUInt16BE(pdu.length + 1, 4); // Length = PDU length + Unit ID byte
  mbapHeader.writeUInt8(unitId, 6); // Unit ID

  return Buffer.concat([mbapHeader, pdu]);
};

/**
 * Helper function to send a Modbus request, matching original structure.
 * Includes basic timeout and exception handling.
 */
const sendModbusRequest = (
  ip: string,
  port: number,
  request: Buffer,
  callback: (response: Buffer) => void, // Success callback
  setStatus: (msg: string) => void, // Status/Error callback
) => {
  const client = TcpSocket.createConnection({host: ip, port}, () => {
    // setStatus(`Sending: ${request.toString('hex')}`);
    // Use underlying ArrayBuffer for Uint8Array conversion
    client.write(
      new Uint8Array(request.buffer, request.byteOffset, request.byteLength),
    );
  });

  let responseBuffer = Buffer.alloc(0);
  let requestTimeout: NodeJS.Timeout | null = null;

  const cleanup = () => {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      requestTimeout = null;
    }
    if (!client.destroyed) {
      client.destroy();
    }
  };

  requestTimeout = setTimeout(() => {
    setStatus('Error: Modbus request timed out');
    cleanup();
  }, 5000); // 5 second timeout

  client.on('data', data => {
    // setStatus(`Received chunk: ${data.toString('hex')}`);
    // Ensure data is a Buffer before concatenation
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    responseBuffer = Buffer.concat([responseBuffer, dataBuffer]);
    if (responseBuffer.length >= 6) {
      // MBAP header received
      const expectedLengthMBAP = responseBuffer.readUInt16BE(4); // Length field in MBAP
      const totalExpectedLength = 6 + expectedLengthMBAP - 1; // MBAP + PDU (-1 because UnitID is counted in length field but part of MBAP header)
      // Check if full response possibly received
      if (responseBuffer.length >= totalExpectedLength) {
        cleanup(); // Clear timeout, got potential full response
        // Check for Modbus Exception Response (Function code MSB is set)
        // MBAP(7 bytes) + PDU(starts with FC)
        if (responseBuffer.length >= 8 && responseBuffer[7] & 0x80) {
          const functionCode = responseBuffer[7] & 0x7f;
          const exceptionCode = responseBuffer[8];
          setStatus(
            `Error: Modbus Exception ${exceptionCode} for function ${functionCode}`,
          );
        } else {
          callback(responseBuffer); // Handle the successful response
        }
      }
      // If not complete, wait for more data or timeout
    }
  });

  client.on('error', error => {
    setStatus(`Error: ${error.message}`);
    cleanup();
  });

  client.on('close', () => {
    // If timeout didn't fire first, this might indicate an issue if no response was processed
    // setStatus('Connection closed');
    cleanup(); // Ensure timeout is cleared if closed prematurely
  });
};

// --- General Functions ---

/**
 * Turn ON/OFF lamp using UV_On_Off_Command (Coil 9 -> 0-based 8)
 * Matches Python: toggle_power() -> write_coil(addr=9, value=True/False) -> FC05
 */
const toggleLamp = (
  ip: string,
  port: number,
  value: boolean, // true = ON, false = OFF
  setStatus: (msg: string) => void,
) => {
  const address = 8; // 0-based for Coil 9
  const writeValue = value ? 0xff00 : 0x0000;
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    0x05,
    address,
    writeValue,
  );
  setStatus(`Sending command to turn lamp ${value ? 'ON' : 'OFF'}...`);
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (
        data &&
        data.length >= 12 &&
        data[7] === 0x05 &&
        data.readUInt16BE(8) === address
      ) {
        setStatus(`Lamp ${value ? 'ON' : 'OFF'} command sent successfully.`);
        setStatus('Note: Status update may take up to 5 seconds.'); // Match Python sleep(5) context
      } else {
        setStatus(
          `Error: Unexpected response for toggleLamp: ${data?.toString('hex')}`,
        );
      }
    },
    setStatus,
  );
};

/**
 * Read current power status (Discrete 21 -> 0-based 20)
 * Matches Python: read_power_status() -> read_discrete(addr=21, count=1) -> FC02
 */
const readPowerStatus = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setPowerStatusState: (isOn: boolean | null) => void,
) => {
  const address = 20; // 0-based for Discrete 21
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus('Reading Power Status...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (data && data.length >= 10 && data[8] === 1) {
        // Byte count should be 1
        const statusBit = data[9] & 0x01;
        const isOn = statusBit === 1;
        setStatus(`Power Status: ${isOn ? 'ON' : 'OFF'}`);
        setPowerStatusState(isOn);
      } else {
        setStatus(
          `Error: Invalid response for readPowerStatus: ${data?.toString(
            'hex',
          )}`,
        );
        setPowerStatusState(null);
      }
    },
    setStatus,
  );
};

// --- UV Lamp Functions ---

/**
 * Reset lamp run hours for a specific UV lamp (Coils 1, 3, 5, 7)
 * Matches Python: rest_UV_hours() -> write_coil(addr=1/3/5/7, True) -> sleep(0.5) -> write_coil(addr=1/3/5/7, False) -> FC05
 */
const resetLampHours = (
  ip: string,
  port: number,
  lampIndex: number, // 1, 2, 3, or 4
  setStatus: (msg: string) => void,
) => {
  if (lampIndex < 1 || lampIndex > 4) {
    setStatus(`Error: Invalid lamp index ${lampIndex} for resetLampHours`);
    return;
  }
  const address = 0 + (lampIndex - 1) * 2; // Calculate 0-based address
  const writeValueOn = 0xff00;
  const writeValueOff = 0x0000;
  const functionCode = 0x05;

  const requestOn = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    address,
    writeValueOn,
  );
  const requestOff = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    address,
    writeValueOff,
  );

  setStatus(`Resetting UV ${lampIndex} Run Hours (Step 1/2)...`);
  sendModbusRequest(
    ip,
    port,
    requestOn,
    responseOn => {
      if (
        responseOn &&
        responseOn.length >= 12 &&
        responseOn[7] === functionCode &&
        responseOn.readUInt16BE(8) === address
      ) {
        setStatus(`UV ${lampIndex} Run Hours Reset (Step 2/2)...`);
        setTimeout(() => {
          sendModbusRequest(
            ip,
            port,
            requestOff,
            responseOff => {
              if (
                responseOff &&
                responseOff.length >= 12 &&
                responseOff[7] === functionCode &&
                responseOff.readUInt16BE(8) === address
              ) {
                setStatus(`UV ${lampIndex} Run Hours Reset Complete.`);
              } else {
                setStatus(
                  `Error: Reset UV ${lampIndex} failed on Step 2 (OFF). Response: ${responseOff?.toString(
                    'hex',
                  )}`,
                );
              }
            },
            setStatus,
          );
        }, 500); // 500 ms delay
      } else {
        setStatus(
          `Error: Reset UV ${lampIndex} failed on Step 1 (ON). Response: ${responseOn?.toString(
            'hex',
          )}`,
        );
      }
    },
    setStatus,
  );
};

/**
 * Read CURRENT and MAX lamp run hours for a specific UV lamp.
 * Current hours from input registers (2, 6, 10, 14)
 * Max hours from Lightlife_Hours_STPT (holding register 6)
 */
const readLampHours = (
  ip: string,
  port: number,
  lampIndex: number,
  onError: (msg: string) => void,
  onSuccess: (lampIndex: number, hours: LampHours | null) => void,
) => {
  try {
    // Validate lampIndex
    if (lampIndex < 1 || lampIndex > 4) {
      onError(`Invalid lamp index: ${lampIndex}. Must be between 1-4.`);
      onSuccess(lampIndex, null);
      return;
    }

    const inputRegisterMap = {
      1: 1, // Input register 2 → index 1
      2: 5, // Input register 6 → index 5
      3: 9, // Input register 10 → index 9
      4: 13, // Input register 14 → index 13
    };

    const currentHoursAddr =
      inputRegisterMap[lampIndex as keyof typeof inputRegisterMap];
    const maxHoursAddr = 5; // Holding register 6 → index 5

    console.log(
      `[readLampHours] Reading lamp ${lampIndex} hours from ${ip}:${port}`,
    );

    // Read current hours - input register
    const currentRequest = createModbusRequest(
      MODBUS_UNIT_ID,
      0x04, // FC04 Read Input Registers
      currentHoursAddr,
      1,
    );

    // Read max hours - holding register
    const maxRequest = createModbusRequest(
      MODBUS_UNIT_ID,
      0x03, // FC03 Read Holding Registers
      maxHoursAddr,
      1,
    );

    let currentHours: number | null = null;
    let maxHours: number | null = null;

    const handleResponse = () => {
      if (currentHours !== null && maxHours !== null) {
        console.log(
          `[readLampHours] Lamp ${lampIndex} → Current: ${currentHours}, Max: ${maxHours}`,
        );
        onSuccess(lampIndex, {
          current: currentHours,
          max: maxHours,
        });
      }
    };

    // Read current hours
    sendModbusRequest(
      ip,
      port,
      currentRequest,
      data => {
        if (data && data.length >= 9 + 2 && data[8] === 0x04) {
          try {
            currentHours = data.readUInt16BE(9);
            console.log(
              `[readLampHours] Current hours raw data: ${data.toString('hex')}`,
            );
            handleResponse();
          } catch (e) {
            onError(
              `Error parsing current hours for lamp ${lampIndex}: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
            onSuccess(lampIndex, null);
          }
        } else {
          onError(`Invalid response for current hours (lamp ${lampIndex})`);
          onSuccess(lampIndex, null);
        }
      },
      msg =>
        onError(`Error reading current hours for lamp ${lampIndex}: ${msg}`),
    );

    // Read max hours
    sendModbusRequest(
      ip,
      port,
      maxRequest,
      data => {
        if (data && data.length >= 9 + 2 && data[8] === 0x03) {
          try {
            maxHours = data.readUInt16BE(9);
            console.log(
              `[readLampHours] Max hours raw data: ${data.toString('hex')}`,
            );
            handleResponse();
          } catch (e) {
            onError(
              `Error parsing max hours for lamp ${lampIndex}: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
            onSuccess(lampIndex, null);
          }
        } else {
          onError(`Invalid response for max hours (lamp ${lampIndex})`);
          onSuccess(lampIndex, null);
        }
      },
      msg => onError(`Error reading max hours for lamp ${lampIndex}: ${msg}`),
    );
  } catch (error) {
    const errorMsg = `Unexpected error in readLampHours: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(errorMsg);
    onError(errorMsg);
    onSuccess(lampIndex, null);
  }
};

/**
 * Configure lamp life setpoint (Holding 6 -> 0-based 5).
 * Matches Python: configure_lamp_hours() -> write_holding(addr=6, value=hours, data_type="float32") -> FC16
 * Writes 2 registers (Float32).
 */
const setLampLife = (
  ip: string,
  port: number,
  value: number, // Life hours (float)
  setStatus: (msg: string) => void,
) => {
  const startAddress = 5; // 0-based address
  const quantity = 2; // Number of registers for float

  // Convert float value to two 16-bit registers (Big Endian)
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value, 0);
  const writeData = Buffer.from([buffer[0], buffer[1], buffer[2], buffer[3]]); // Ensure correct order for FC16

  // Use FC16 to write multiple registers
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    0x10,
    startAddress,
    quantity,
    writeData,
  );
  setStatus('Setting Lamp Life Setpoint...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      // Response for FC16: MBAP(7), FC(1), StartAddr(2), QuantityRegs(2) -> total 12 bytes
      if (
        data &&
        data.length >= 12 &&
        data[7] === 0x10 &&
        data.readUInt16BE(8) === startAddress &&
        data.readUInt16BE(10) === quantity
      ) {
        setStatus(`Lamp Life Setpoint set to ${value} hours successfully.`);
        // Optionally add read back verification here: readLampLifeSetpoint(ip, port, setStatus, ...)
      } else {
        setStatus(
          `Error: Failed to set Lamp Life Setpoint. Response: ${data?.toString(
            'hex',
          )}`,
        );
      }
    },
    setStatus,
  );
};

/**
 * Read lamp life setpoint (Holding 6 -> 0-based 5).
 * Matches Python: read_lamp_setpoint() -> read_holding(addr=6, count=2, data_type="float32") -> FC03
 * Reads 2 registers (Float32).
 */
const readLampLifeSetpoint = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setSetpointValue: (value: number | null) => void,
) => {
  const startAddress = 5; // 0-based address
  const quantity = 2; // Read 2 registers for float

  // Use FC03 to read holding registers
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    0x03,
    startAddress,
    quantity,
  );
  setStatus('Reading Lamp Life Setpoint...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      // MBAP(7) + FC(1) + ByteCount(1) = 9 bytes header before data
      const expectedDataBytes = quantity * 2; // 2 bytes per register

      // Log the raw received data (hex)
      console.log(
        `[readLampLifeSetpoint] Received Raw Hex: ${data?.toString('hex')}`,
      );

      if (
        data &&
        data.length >= 9 + expectedDataBytes &&
        data[8] === expectedDataBytes
      ) {
        // Revert to direct Big-Endian read
        const floatValue = data.readFloatBE(9);

        // Log the parsed value
        console.log(`[readLampLifeSetpoint] Parsed Value (BE): ${floatValue}`);

        setStatus(`Lamp Life Setpoint read: ${floatValue}`);
        setSetpointValue(floatValue);
      } else {
        setStatus(
          `Error: Invalid response for readLampLifeSetpoint: ${data?.toString(
            'hex',
          )}`,
        );
        setSetpointValue(null);
      }
    },
    setStatus,
  );
};

// --- Cleaning Status Functions ---

/**
 * Read overall lamp cleaning status (Discrete 25 -> 0-based 24).
 * Matches Python: read_UV_combined_clean_status() -> read_discrete(addr=25, count=1) -> FC02
 */
const readCombinedCleaningStatus = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setCleaningStatus: (needsCleaning: boolean | null) => void,
) => {
  const address = 24; // 0-based for Discrete 25
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus('Reading Combined Cleaning Status...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (data && data.length >= 10 && data[8] === 1) {
        const statusBit = data[9] & 0x01;
        const needsCleaning = statusBit === 1;
        setStatus(
          `Combined Cleaning Status: ${needsCleaning ? 'Required' : 'OK'}`,
        );
        setCleaningStatus(needsCleaning);
      } else {
        setStatus(
          `Error: Invalid response for readCombinedCleaningStatus: ${data?.toString(
            'hex',
          )}`,
        );
        setCleaningStatus(null);
      }
    },
    setStatus,
  );
};

/**
 * Reset cleaning hours for a specific lamp (Coils 11, 13, 15, 17).
 * Matches Python: reset_UV_clean_status() -> write_coil(addr=11/13/15/17, True/False) -> FC05
 */
const resetCleaningHours = (
  ip: string,
  port: number,
  lampIndex: number, // 1, 2, 3, or 4
  setStatus: (msg: string) => void,
) => {
  if (lampIndex < 1 || lampIndex > 4) {
    setStatus(`Error: Invalid lamp index ${lampIndex} for resetCleaningHours`);
    return;
  }
  const address = 10 + (lampIndex - 1) * 2; // Calculate 0-based address
  const writeValueOn = 0xff00;
  const writeValueOff = 0x0000;
  const functionCode = 0x05;

  const requestOn = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    address,
    writeValueOn,
  );
  const requestOff = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    address,
    writeValueOff,
  );

  setStatus(`Resetting UV ${lampIndex} Cleaning Hours (Step 1/2)...`);
  sendModbusRequest(
    ip,
    port,
    requestOn,
    responseOn => {
      if (
        responseOn &&
        responseOn.length >= 12 &&
        responseOn[7] === functionCode &&
        responseOn.readUInt16BE(8) === address
      ) {
        setStatus(`UV ${lampIndex} Cleaning Hours Reset (Step 2/2)...`);
        setTimeout(() => {
          sendModbusRequest(
            ip,
            port,
            requestOff,
            responseOff => {
              if (
                responseOff &&
                responseOff.length >= 12 &&
                responseOff[7] === functionCode &&
                responseOff.readUInt16BE(8) === address
              ) {
                setStatus(`UV ${lampIndex} Cleaning Hours Reset Complete.`);
              } else {
                setStatus(
                  `Error: Reset Cleaning UV ${lampIndex} failed on Step 2 (OFF). Response: ${responseOff?.toString(
                    'hex',
                  )}`,
                );
              }
            },
            setStatus,
          );
        }, 500);
      } else {
        setStatus(
          `Error: Reset Cleaning UV ${lampIndex} failed on Step 1 (ON). Response: ${responseOn?.toString(
            'hex',
          )}`,
        );
      }
    },
    setStatus,
  );
};

/**
 * Read lamp cleaning run hours (Input 24, 26, 28, 30).
 * Matches Python: read_UV_clean_hours() -> read_input(addr=24/26/28/30, count=2, data_type="float32") -> FC04
 * Reads 2 registers (Float32).
 */
const readLampCleaningRunHours = (
  ip: string,
  port: number,
  lampIndex: number, // 1, 2, 3, or 4
  setStatus: (msg: string) => void,
  setCleanRunHours: (lampIndex: number, hours: number | null) => void,
) => {
  if (lampIndex < 1 || lampIndex > 4) {
    setStatus('Error: Invalid lamp index (1-4) for readLampCleaningRunHours.');
    setCleanRunHours(lampIndex, null);
    return;
  }
  // Input 24, 26, 28, 30 -> 0-based 23, 25, 27, 29
  // ** NOTE: Address 30 (0-based 29) has potential conflict in original table **
  const address = 23 + (lampIndex - 1) * 2;
  const quantity = 2; // Read 2 registers for float32 (matches Python)
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x04, address, quantity); // FC04 Read Input Registers

  setStatus(`Reading UV ${lampIndex} Cleaning Run Hours...`);
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      const expectedDataBytes = 4;
      if (
        data &&
        data.length >= 9 + expectedDataBytes &&
        data[8] === expectedDataBytes
      ) {
        try {
          const hours = data.readFloatBE(9);
          setStatus(`UV ${lampIndex} Cleaning Run Hours: ${hours.toFixed(2)}`);
          setCleanRunHours(lampIndex, hours);
        } catch (e: any) {
          setStatus(
            `Error parsing UV ${lampIndex} Cleaning Run Hours: ${e.message}`,
          );
          setCleanRunHours(lampIndex, null);
        }
      } else {
        setStatus(
          `Error: Invalid response for readLampCleaningRunHours UV ${lampIndex}: ${data?.toString(
            'hex',
          )}`,
        );
        setCleanRunHours(lampIndex, null);
      }
    },
    setStatus,
  );
};

/**
 * Configure cleaning hours setpoint (Holding 2 -> 0-based 1).
 * Matches Python: configure_cleaning_hours() -> write_holding(addr=2, value=hours, data_type="float32") -> FC16
 * Writes 2 registers (Float32).
 */
const setCleaningHours = (
  ip: string,
  port: number,
  value: number, // Cleaning hours (float)
  setStatus: (msg: string) => void,
) => {
  const startAddress = 1; // 0-based address
  const quantity = 2; // Number of registers for float

  // Convert float value to two 16-bit registers (Big Endian)
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value, 0);
  const writeData = Buffer.from([buffer[0], buffer[1], buffer[2], buffer[3]]);

  // Use FC16 to write multiple registers
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    0x10,
    startAddress,
    quantity,
    writeData,
  );
  setStatus('Setting Cleaning Hours Setpoint...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (
        data &&
        data.length >= 12 &&
        data[7] === 0x10 &&
        data.readUInt16BE(8) === startAddress &&
        data.readUInt16BE(10) === quantity
      ) {
        setStatus(
          `Cleaning Hours Setpoint set to ${value} hours successfully.`,
        );
        // Optionally add read back: readCleaningHoursSetpoint(ip, port, setStatus, ...)
      } else {
        setStatus(
          `Error: Failed to set Cleaning Hours Setpoint. Response: ${data?.toString(
            'hex',
          )}`,
        );
      }
    },
    setStatus,
  );
};
/**
 * Read cleaning hours setpoint (Holding 2 -> 0-based 1).
 * Matches Python: read_clean_setpoint() -> read_holding(addr=2, count=2, data_type="float32") -> FC03
 * Reads 2 registers (Float32).
 */
const readCleaningHoursSetpoint = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setSetpointValue: (value: number | null) => void,
) => {
  const startAddress = 1; // 0-based address
  const quantity = 2; // Read 2 registers for float

  // Use FC03 to read holding registers
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    0x03,
    startAddress,
    quantity,
  );
  setStatus('Reading Cleaning Hours Setpoint...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      const expectedDataBytes = 4;
      if (
        data &&
        data.length >= 9 + expectedDataBytes &&
        data[8] === expectedDataBytes
      ) {
        try {
          // Revert to direct Big-Endian read
          const value = data.readFloatBE(9);

          setStatus(`Cleaning Hours Setpoint: ${value.toFixed(2)} hours`);
          setSetpointValue(value);
        } catch (e: any) {
          setStatus(`Error parsing Cleaning Hours Setpoint: ${e.message}`);
          setSetpointValue(null);
        }
      } else {
        setStatus(
          `Error: Invalid response for readCleaningHoursSetpoint: ${data?.toString(
            'hex',
          )}`,
        );
        setSetpointValue(null);
      }
    },
    setStatus,
  );
};

// --- Sensors Functions ---

/**
 * Read DPS Status (Discrete 17 -> 0-based 16).
 * Matches Python: read_dps_status() -> read_discrete(addr=17, count=1) -> FC02
 */
const readDPS = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setDpsStatus: (isOk: boolean | null) => void,
) => {
  const address = 16; // 0-based for Discrete 17
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus('Reading DPS Status...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (data && data.length >= 10 && data[8] === 1) {
        const statusBit = data[9] & 0x01;
        const isOk = statusBit === 1;
        setStatus(
          `DPS Status: ${isOk ? 'OK' : 'Pressure Issue (Trigger Door Icon)'}`,
        );
        setDpsStatus(isOk);
      } else {
        setStatus(
          `Error: Invalid response for readDPS: ${data?.toString('hex')}`,
        );
        setDpsStatus(null);
      }
    },
    setStatus,
  );
};

/**
 * Read Pressure Button / Limit Switch Status (Discrete 19 -> 0-based 18).
 * Matches Python: read_limit_switch_status() -> read_discrete(addr=19, count=1) -> FC02
 */
const readPressureButton = (
  // Keep name consistent with original RN code
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setButtonStatus: (isOk: boolean | null) => void,
) => {
  const address = 18; // 0-based for Discrete 19
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus('Reading Pressure Button Status...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (data && data.length >= 10 && data[8] === 1) {
        const statusBit = data[9] & 0x01;
        const isOk = statusBit === 1;
        setStatus(
          `Pressure Button Status: ${
            isOk ? 'OK' : 'Pressed/Issue (Trigger Filter Icon)'
          }`,
        );
        setButtonStatus(isOk);
      } else {
        setStatus(
          `Error: Invalid response for readPressureButton: ${data?.toString(
            'hex',
          )}`,
        );
        setButtonStatus(null);
      }
    },
    setStatus,
  );
};

/**
 * Read number of lamps online (Input 22 -> 0-based 21).
 * Matches Python: read_lamps_online() -> read_input(addr=22, count=2, data_type="float32") -> FC04
 * Reads 2 registers (Float32).
 */
const readLampsOnline = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setLampsOnlineCount: (count: number | null) => void, // Returning number, even if read as float
) => {
  const address = 21; // 0-based for Input 22
  const quantity = 2; // Read 2 registers for float32 (matches Python)
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x04, address, quantity); // FC04 Read Input Registers
  setStatus('Reading Number of Lamps Online...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      const expectedDataBytes = 4;
      if (
        data &&
        data.length >= 9 + expectedDataBytes &&
        data[8] === expectedDataBytes
      ) {
        try {
          const countFloat = data.readFloatBE(9);
          const countInt = Math.round(countFloat); // Convert float to integer for count
          setStatus(
            `Lamps Online: ${countInt} (read as ${countFloat.toFixed(2)})`,
          );
          setLampsOnlineCount(countInt);
        } catch (e: any) {
          setStatus(`Error parsing Lamps Online count: ${e.message}`);
          setLampsOnlineCount(null);
        }
      } else {
        setStatus(
          `Error: Invalid response for readLampsOnline: ${data?.toString(
            'hex',
          )}`,
        );
        setLampsOnlineCount(null);
      }
    },
    setStatus,
  );
};

/**
 * Read Current Amps (CT) (Input 18 -> 0-based 17).
 * Matches Python: read_CT() -> read_input(addr=18, count=2, data_type="float32") -> FC04
 * Reads 2 registers (Float32).
 */
const readCurrentAmps = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setCurrentAmpsValue: (amps: number | null) => void,
) => {
  const address = 17; // 0-based for Input 18
  const quantity = 2; // Read 2 registers for float32 (matches Python)
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x04, address, quantity);
  setStatus('Reading Current Amps (CT)...');
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      const expectedDataBytes = 4;
      if (
        data &&
        data.length >= 9 + expectedDataBytes &&
        data[8] === expectedDataBytes
      ) {
        try {
          const amps = data.readFloatBE(9);
          setStatus(`Current Amps: ${amps.toFixed(2)} A`);
          setCurrentAmpsValue(amps);
        } catch (e: any) {
          setStatus(`Error parsing Current Amps: ${e.message}`);
          setCurrentAmpsValue(null);
        }
      } else {
        setStatus(
          `Error: Invalid response for readCurrentAmps: ${data?.toString(
            'hex',
          )}`,
        );
        setCurrentAmpsValue(null);
      }
    },
    setStatus,
  );
};

// --- Potentially Missing but Present in Python (Add if needed) ---

/**
 * Read individual UV clean status (Discrete 1, 5, 9, 13).
 * Matches Python: read_UV_clean_status() -> read_discrete(addr=1/5/9/13, count=1) -> FC02
 */
const readLampCleanStatus = (
  ip: string,
  port: number,
  lampIndex: number, // 1, 2, 3, or 4
  setStatus: (msg: string) => void,
  setCleanStat: (lampIndex: number, needsCleaning: boolean | null) => void,
) => {
  if (lampIndex < 1 || lampIndex > 4) {
    setStatus('Error: Invalid lamp index (1-4) for readLampCleanStatus.');
    setCleanStat(lampIndex, null);
    return;
  }
  // Discrete 1, 5, 9, 13 -> 0-based 0, 4, 8, 12
  const address = (lampIndex - 1) * 4;
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus(`Reading UV ${lampIndex} Clean Status...`);
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (data && data.length >= 10 && data[8] === 1) {
        const statusBit = data[9] & 0x01;
        const needsCleaning = statusBit === 1; // Assuming 1 = Needs Cleaning
        setStatus(
          `UV ${lampIndex} Clean Status: ${needsCleaning ? 'Required' : 'OK'}`,
        );
        setCleanStat(lampIndex, needsCleaning);
      } else {
        setStatus(
          `Error: Invalid response for readLampCleanStatus ${lampIndex}: ${data?.toString(
            'hex',
          )}`,
        );
        setCleanStat(lampIndex, null);
      }
    },
    setStatus,
  );
};

/**
 * Read individual UV life status (Discrete 3, 7, 11, 15).
 * Matches Python: read_UV_life_status() -> read_discrete(addr=3/7/11/15, count=1) -> FC02
 */
const readLampLifeStatus = (
  ip: string,
  port: number,
  lampIndex: number, // 1, 2, 3, or 4
  setStatus: (msg: string) => void,
  setLifeStat: (lampIndex: number, endOfLife: boolean | null) => void,
) => {
  if (lampIndex < 1 || lampIndex > 4) {
    setStatus('Error: Invalid lamp index (1-4) for readLampLifeStatus.');
    setLifeStat(lampIndex, null);
    return;
  }
  // Discrete 3, 7, 11, 15 -> 0-based 2, 6, 10, 14
  const address = (lampIndex - 1) * 4 + 2;
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus(`Reading UV ${lampIndex} Life Status...`);
  sendModbusRequest(
    ip,
    port,
    request,
    data => {
      if (data && data.length >= 10 && data[8] === 1) {
        const statusBit = data[9] & 0x01;
        const endOfLife = statusBit === 1; // Assuming 1 = End of Life reached
        setStatus(
          `UV ${lampIndex} Life Status: ${endOfLife ? 'End of Life' : 'OK'}`,
        );
        setLifeStat(lampIndex, endOfLife);
      } else {
        setStatus(
          `Error: Invalid response for readLampLifeStatus ${lampIndex}: ${data?.toString(
            'hex',
          )}`,
        );
        setLifeStat(lampIndex, null);
      }
    },
    setStatus,
  );
};

// --- Export Functions ---
export {
  // General
  toggleLamp,
  readPowerStatus,
  // UV Lamp Specific
  resetLampHours,
  readLampHours,
  setLampLife,
  readLampLifeSetpoint,
  // Cleaning
  readCombinedCleaningStatus,
  resetCleaningHours,
  readLampCleaningRunHours,
  setCleaningHours,
  readCleaningHoursSetpoint,
  // Sensors
  readDPS,
  readPressureButton,
  readLampsOnline,
  readCurrentAmps,
  // Individual Statuses (Added based on Python functions)
  readLampCleanStatus,
  readLampLifeStatus,
};
