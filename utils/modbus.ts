import TcpSocket from 'react-native-tcp-socket';
import {Buffer} from 'buffer';

// --- Configuration ---
const MODBUS_UNIT_ID = 1;
const MAX_CONNECTIONS = 5;
const REQUEST_TIMEOUT = 5000; // 5 seconds
const CONNECTION_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes
const REQUEST_DELAY = 250; // Delay between requests in ms
const MAX_QUEUE_SIZE = 100;
const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB

// --- Shared Types ---
interface LampHours {
  currentHours: number;
}

interface QueuedRequest {
  ip: string;
  port: number;
  request: Buffer;
  resolve: (value: Buffer) => void;
  reject: (reason?: any) => void;
}

// --- Request Queue Manager ---
class RequestQueueManager {
  private static instance: RequestQueueManager;
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private activeConnections = 0;

  public static getInstance(): RequestQueueManager {
    if (!RequestQueueManager.instance) {
      RequestQueueManager.instance = new RequestQueueManager();
    }
    return RequestQueueManager.instance;
  }

  public enqueue(request: QueuedRequest): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      request.reject(new Error('Request queue full'));
      return;
    }

    this.queue.push(request);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (
      this.isProcessing ||
      this.queue.length === 0 ||
      this.activeConnections >= MAX_CONNECTIONS
    ) {
      return;
    }

    this.isProcessing = true;
    const nextRequest = this.queue.shift()!;

    try {
      this.activeConnections++;
      const response = await this.executeRequest(nextRequest);
      nextRequest.resolve(response);
    } catch (error) {
      nextRequest.reject(error);
    } finally {
      this.activeConnections--;
      this.isProcessing = false;

      // Process next request after delay
      setTimeout(() => this.processQueue(), REQUEST_DELAY);
    }
  }

  private async executeRequest({
    ip,
    port,
    request,
  }: QueuedRequest): Promise<Buffer> {
    const connectionManager = TcpConnectionManager.getInstance();
    const client = await connectionManager.getConnection(ip, port);

    return new Promise((resolve, reject) => {
      let responseBuffer = Buffer.alloc(0);
      let requestTimeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (requestTimeout) {
          clearTimeout(requestTimeout);
          requestTimeout = null;
        }
        client.removeListener('data', dataHandler);
        client.removeListener('error', errorHandler);
      };

      requestTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('Modbus request timed out'));
      }, REQUEST_TIMEOUT);

      const dataHandler = (data: Buffer) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);

        if (responseBuffer.length > MAX_RESPONSE_SIZE) {
          cleanup();
          reject(new Error('Response too large'));
          return;
        }

        if (responseBuffer.length >= 6) {
          const expectedLengthMBAP = responseBuffer.readUInt16BE(4);
          const totalExpectedLength = 6 + expectedLengthMBAP;

          if (responseBuffer.length >= totalExpectedLength) {
            if (responseBuffer.length >= 8 && responseBuffer[7] & 0x80) {
              const functionCode = responseBuffer[7] & 0x7f;
              const exceptionCode = responseBuffer[8];
              cleanup();
              reject(
                new Error(
                  `Modbus Exception ${exceptionCode} for function ${functionCode}`,
                ),
              );
            } else {
              cleanup();
              resolve(responseBuffer);
            }
          }
        }
      };

      const errorHandler = (error: Error) => {
        cleanup();
        reject(new Error(`Connection error: ${error.message}`));
      };

      client.on('data', dataHandler);
      client.on('error', errorHandler);

      client.write(request, (error?: Error) => {
        if (error) {
          cleanup();
          reject(new Error(`Write error: ${error.message}`));
        }
      });
    });
  }
}

// --- Connection Manager ---
class TcpConnectionManager {
  private static instance: TcpConnectionManager;
  private connections: Map<string, any> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private connectionHandlers: Map<
    string,
    {errorHandler: (error: Error) => void; closeHandler: () => void}
  > = new Map();

  public static getInstance(): TcpConnectionManager {
    if (!TcpConnectionManager.instance) {
      TcpConnectionManager.instance = new TcpConnectionManager();
    }
    return TcpConnectionManager.instance;
  }

  public async getConnection(host: string, port: number): Promise<any> {
    const connectionKey = `${host}:${port}`;

    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey);
      if (!connection.destroyed) {
        return connection;
      }
      this.closeConnection(connectionKey);
    }

    return this.createConnection(host, port);
  }

  private createConnection(host: string, port: number): Promise<any> {
    const connectionKey = `${host}:${port}`;
    this.closeConnection(connectionKey);

    return new Promise((resolve, reject) => {
      const client = TcpSocket.createConnection({host, port}, () => {
        this.connections.set(connectionKey, client);

        const timer = setTimeout(() => {
          this.refreshConnection(host, port);
        }, CONNECTION_REFRESH_INTERVAL);

        this.refreshTimers.set(connectionKey, timer);
        resolve(client);
      });

      const errorHandler = (error: Error) => {
        console.error(`Connection error for ${connectionKey}:`, error);
        this.closeConnection(connectionKey);
        reject(error);
      };

      const closeHandler = () => {
        this.closeConnection(connectionKey);
      };

      client.on('error', errorHandler);
      client.on('close', closeHandler);

      this.connectionHandlers.set(connectionKey, {errorHandler, closeHandler});
    });
  }

  private refreshConnection(host: string, port: number): void {
    const connectionKey = `${host}:${port}`;
    this.createConnection(host, port).catch(error => {
      console.error(`Failed to refresh connection: ${error.message}`);
      setTimeout(() => this.refreshConnection(host, port), 5000);
    });
  }

  private closeConnection(connectionKey: string): void {
    if (this.refreshTimers.has(connectionKey)) {
      clearTimeout(this.refreshTimers.get(connectionKey));
      this.refreshTimers.delete(connectionKey);
    }

    const handlers = this.connectionHandlers.get(connectionKey);
    if (handlers) {
      const connection = this.connections.get(connectionKey);
      if (connection) {
        connection.removeListener('error', handlers.errorHandler);
        connection.removeListener('close', handlers.closeHandler);
      }
      this.connectionHandlers.delete(connectionKey);
    }

    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey);
      if (connection && !connection.destroyed) {
        connection.destroy();
      }
      this.connections.delete(connectionKey);
    }
  }

  public closeAllConnections(): void {
    for (const connectionKey of this.connections.keys()) {
      this.closeConnection(connectionKey);
    }
  }
}

// --- Modbus Request Functions ---
export const sendModbusRequest = (
  ip: string,
  port: number,
  request: Buffer,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    RequestQueueManager.getInstance().enqueue({
      ip,
      port,
      request,
      resolve,
      reject,
    });
  });
};

const createModbusRequest = (
  unitId: number,
  functionCode: number,
  startAddress: number,
  quantity: number,
  writeData?: Buffer,
): Buffer => {
  let pdu: Buffer;

  if ([0x01, 0x02, 0x03, 0x04].includes(functionCode)) {
    pdu = Buffer.alloc(5);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3);
  } else if (functionCode === 0x05 || functionCode === 0x06) {
    pdu = Buffer.alloc(5);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3);
  } else if (functionCode === 0x0f && writeData) {
    const byteCount = writeData.length;
    pdu = Buffer.alloc(6 + byteCount);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3);
    pdu.writeUInt8(byteCount, 5);
    writeData.copy(pdu, 6);
  } else if (functionCode === 0x10 && writeData) {
    const quantity = writeData.length / 2;
    const byteCount = writeData.length;
    pdu = Buffer.alloc(6 + byteCount);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3);
    pdu.writeUInt8(byteCount, 5);
    writeData.copy(pdu, 6);
  } else {
    pdu = Buffer.from([functionCode]);
  }

  const mbapHeader = Buffer.alloc(7);
  mbapHeader.writeUInt16BE(Math.floor(Math.random() * 65535), 0);
  mbapHeader.writeUInt16BE(0x0000, 2);
  mbapHeader.writeUInt16BE(pdu.length + 1, 4);
  mbapHeader.writeUInt8(unitId, 6);

  return Buffer.concat([mbapHeader, pdu]);
};

// --- General Functions ---

/**
 * Turn ON/OFF lamp using UV_On_Off_Command (Coil 9 -> 0-based 8)
 * Uses async/await and returns a Promise.
 */
export const toggleLamp = async (
  ip: string,
  port: number,
  value: boolean, // true = ON, false = OFF
): Promise<void> => {
  const address = 9; // Coil 9
  const writeValue = value ? 0xff00 : 0x0000;
  const functionCodeCoil = 0x05; // Write Single Coil

  // Create requests for the main coil and power status discrete
  const mainRequest = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCodeCoil,
    address,
    writeValue,
  );

  console.log(
    `[toggleLamp] Sending command to turn ${value ? 'ON' : 'OFF'}...`,
  );

  try {
    console.log(
      `[toggleLamp] Sending Main Request: ${mainRequest.toString('hex')}`,
    );
    const mainResponse = await sendModbusRequest(ip, port, mainRequest);
    console.log(
      `[toggleLamp] Received Main Response: ${mainResponse?.toString('hex')}`,
    );

    // Check the function code
    if (
      !(
        mainResponse &&
        mainResponse.length >= 12 &&
        mainResponse[7] === functionCodeCoil
      )
    ) {
      throw new Error(
        `Unexpected response for toggleLamp main request: ${mainResponse?.toString(
          'hex',
        )}`,
      );
    }

    //Check the value of the response based on the value given
    if (value) {
      if (mainResponse.readUInt16BE(10) != 0xff00) {
        throw new Error(
          `Unexpected response for toggleLamp main request: ${mainResponse?.toString(
            'hex',
          )}`,
        );
      }
    } else if (mainResponse.readUInt16BE(10) != 0x0000) {
      throw new Error(
        `Unexpected response for toggleLamp main request: ${mainResponse?.toString(
          'hex',
        )}`,
      );
    }

    // Validate power status response

    console.log(
      `[toggleLamp] Lamp ${
        value ? 'ON' : 'OFF'
      } command and power status acknowledged successfully.`,
    );
  } catch (error: any) {
    console.error(`[toggleLamp] Error during send/receive: ${error.message}`);
    throw error; // Reject the promise
  }
};

/**
 * Read current power status (Discrete 21 -> 0-based 20)
 * Returns true if ON, false if OFF, null on error.
 */
export const readPowerStatus = async (
  ip: string,
  port: number,
): Promise<boolean | null> => {
  const address = 21; // 0-based for Discrete 21
  const quantity = 1;
  const functionCode = 0x02; // Read Discrete Inputs
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    address,
    quantity,
  );
  console.log('[readPowerStatus] Reading...'); // Internal log

  try {
    const data = await sendModbusRequest(ip, port, request);
    if (data && data.length >= 10 && data[8] === 1) {
      // Byte count should be 1
      const statusBit = data[9] & 0x01;
      const isOn = statusBit === 1;
      console.log(
        `[readPowerStatus] Success: Status is ${isOn ? 'ON' : 'OFF'}`,
      );
      return isOn;
    } else {
      console.error(
        `[readPowerStatus] Error: Invalid response: ${data?.toString('hex')}`,
      );
      return null;
    }
  } catch (error: any) {
    console.error(
      `[readPowerStatus] Error reading power status: ${error.message}`,
    );
    return null;
  }
};

/**
 * Read the ON/OFF Command Status (Discrete 23 -> 0-based 22)
 * This reflects the current ON/OFF status of the lamp.
 */
export const readCommandStatus = async (
  ip: string,
  port: number,
): Promise<boolean | null> => {
  const address = 23; // 0-based for Discrete 23
  const quantity = 1;
  const functionCode = 0x02; // Read Discrete Inputs
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    address,
    quantity,
  );
  console.log('[readCommandStatus] Reading...');

  try {
    console.log(
      `[readCommandStatus] Sending Request: ${request.toString('hex')}`,
    );
    const data = await sendModbusRequest(ip, port, request);
    // Log the raw response
    console.log(
      `[readCommandStatus] Received Response: ${data?.toString('hex')}`,
    );

    if (data && data.length >= 10 && data[8] === 1) {
      // Byte count should be 1
      const statusBit = data[9] & 0x01;
      const isOn = statusBit === 1; // Assuming 1 means ON command is active
      // Log interpretation
      console.log(
        `[readCommandStatus] Success: Raw Bit=${statusBit}, Interpreted as ${
          isOn ? 'ON' : 'OFF'
        }`,
      );
      return isOn;
    } else {
      console.error(
        `[readCommandStatus] Error: Invalid response structure: ${data?.toString(
          'hex',
        )}`,
      );
      return null;
    }
  } catch (error: any) {
    console.error(
      `[readCommandStatus] Error during send/receive: ${error.message}`,
    );
    return null;
  }
};

// --- UV Lamp Functions ---

/**
 * Reset the lamp life hours for a specific lamp by toggling the coil ON and then OFF with a delay in between.
 */
export const resetLampHours = async (
  ip: string,
  port: number,
  lampIndex: number, // 1-based lamp index (1-4)
  setStatus: (msg: string) => void,
): Promise<void> => {
  const addressMap: {[key: number]: number} = {
    1: 1, // Coil 1
    2: 3, // Coil 3
    3: 5, // Coil 5
    4: 7, // Coil 7
  };

  const address = addressMap[lampIndex];
  if (address === undefined) {
    setStatus(`Error: Invalid lamp index ${lampIndex} for reset.`);
    throw new Error(`Invalid lamp index ${lampIndex} for reset.`);
  }

  const writeValueOn = 0xff00; // Value for ON
  const writeValueOff = 0x0000; // Value for OFF
  const delayMs = 500; // Delay between ON and OFF

  const requestOn = createModbusRequest(
    MODBUS_UNIT_ID,
    0x05, // FC05 Write Single Coil
    address,
    writeValueOn,
  );

  const requestOff = createModbusRequest(
    MODBUS_UNIT_ID,
    0x05, // FC05 Write Single Coil
    address,
    writeValueOff,
  );

  try {
    setStatus(`Sending ON command for Lamp ${lampIndex} (Coil ${address})...`);
    await sendModbusRequest(ip, port, requestOn);
    setStatus(`ON command sent. Waiting ${delayMs}ms...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    setStatus(`Sending OFF command for Lamp ${lampIndex} (Coil ${address})...`);
    await sendModbusRequest(ip, port, requestOff);
    setStatus(`OFF command sent successfully for Lamp ${lampIndex}.`);
  } catch (error) {
    const errorMsg = `Error resetting Lamp ${lampIndex}: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`;
    if (setStatus) {
      setStatus(errorMsg);
    }
    throw error;
  }
};

/**
 * Read the CURRENT lamp life run hours for a specific lamp from Input Registers.
 */
export const readLampHours = async (
  ip: string,
  port: number,
  lampIndex: number, // 1-based lamp index (1-4)
): Promise<LampHours> => {
  const addressMapCurrent: {[key: number]: number} = {
    1: 2, // Input 2
    2: 6, // Input 6
    3: 10, // Input 10
    4: 14, // Input 14
  };
  const startAddressCurrent = addressMapCurrent[lampIndex];

  if (startAddressCurrent === undefined) {
    throw new Error(`Invalid lamp index ${lampIndex} for reading hours.`);
  }

  let currentHours = 0;

  // --- Read Current Hours (FC04 - Input Registers) ---
  try {
    const quantityCurrent = 2; // Read 2 registers for float32
    const functionCodeCurrent = 0x04;
    const requestCurrent = createModbusRequest(
      MODBUS_UNIT_ID,
      functionCodeCurrent,
      startAddressCurrent,
      quantityCurrent,
    );
    console.log(
      `[readLampHours ${lampIndex}] Reading Current (FC04) @ ${startAddressCurrent}`,
    );
    const responseCurrent = await sendModbusRequest(ip, port, requestCurrent);

    if (
      responseCurrent &&
      responseCurrent.length >= 13 && // MBAP(7) + FC(1) + ByteCount(1) + Data(4) = 13
      responseCurrent[7] === functionCodeCurrent &&
      responseCurrent[8] === 4 // Byte count should be 4
    ) {
      currentHours = responseCurrent.readFloatBE(9); // Read as Big-Endian Float
      console.log(
        `[readLampHours ${lampIndex}] Current Hours Raw (Float): ${currentHours}`,
      );
    } else {
      throw new Error(
        `Invalid response for readLampHours (Current): ${responseCurrent?.toString(
          'hex',
        )}`,
      );
    }
  } catch (error: any) {
    console.error(
      `[readLampHours ${lampIndex}] Error reading CURRENT hours: ${error.message}`,
    );
    throw error; // Rethrow the error to indicate failure
  }

  // --- Return Combined Result ---
  return {currentHours};
};

/**
 * Reads the shared Lamp Life Hours Setpoint (Maximum) from Holding Register 6.
 */
export const readLifeHoursSetpoint = async (
  ip: string,
  port: number,
): Promise<number | null> => {
  const startAddress = 6; // Holding Register 6
  const quantity = 2; // Read 2 registers for float32
  const functionCode = 0x03; // Read Holding Registers

  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress,
    quantity,
  );

  console.log(
    `[readLifeHoursSetpoint] Reading (FC03, Float32) @ ${startAddress}`,
  );

  try {
    const response = await sendModbusRequest(ip, port, request);

    // Validate response for FC03 reading 2 registers (4 bytes)
    if (
      response &&
      response.length >= 13 && // MBAP(7) + FC(1) + ByteCount(1) + Data(4) = 13
      response[7] === functionCode &&
      response[8] === 4 // Byte count should be 4
    ) {
      const value = response.readFloatBE(9); // Read as Big-Endian Float
      console.log(`[readLifeHoursSetpoint] Decoded Value (Float): ${value}`);
      return value;
    } else {
      throw new Error(
        `Invalid response for readLifeHoursSetpoint (Float): ${response?.toString(
          'hex',
        )}`,
      );
    }
  } catch (error: any) {
    if (error.message.includes('Modbus Exception 4')) {
      console.warn(
        '[readLifeHoursSetpoint] Life hours setpoint not set. Returning null.',
      );
      return null; // Return null if the setpoint is not set
    }
    throw error; // Re-throw other errors
  }
};

/**
 * Set the SHARED maximum lamp life hours setpoint (Holding Register 6).
 */
export const setLampMaxHours = (
  ip: string,
  port: number,
  value: number,
  setStatus: (msg: string) => void,
): Promise<void> => {
  const startAddress = 6; // Holding Register 6
  const functionCode = 0x06; // Write Single Register (FC6)

  // Convert the float to IEEE 754 format
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value, 0);

  console.log(
    `[setLampMaxHours] Writing float value ${value} (hex: ${buffer.toString(
      'hex',
    )})`,
  );

  // Write the first 16 bits (high word) to the starting register
  const highWord = buffer.readUInt16BE(0);
  const lowWord = buffer.readUInt16BE(2);

  const requestHigh = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress,
    highWord,
  );

  const requestLow = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress + 1,
    lowWord,
  );

  return sendModbusRequest(ip, port, requestHigh)
    .then(() => sendModbusRequest(ip, port, requestLow))
    .then(() => {
      setStatus(`Lamp Max Hours set to ${value} successfully.`);
    })
    .catch(error => {
      const errorMsg = `Error setting Lamp Max Hours: ${error.message}`;
      setStatus(errorMsg);
      console.error(`[setLampMaxHours] ${errorMsg}`, error);
      throw error;
    });
};

/**
 * Reads the Cleaning Hours Setpoint from Holding Register 2.
 */
export const readCleaningHoursSetpoint = async (
  ip: string,
  port: number,
): Promise<number | null> => {
  const startAddress = 2; // Holding Register 2
  const quantity = 2; // Always read 2 registers for float32
  const functionCode = 0x03; // Read Holding Registers

  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress,
    quantity,
  );

  console.log(
    `[readCleaningHoursSetpoint] Reading float32 (FC03) @ ${startAddress}`,
  );

  try {
    const response = await sendModbusRequest(ip, port, request);

    // Validate response for FC03 reading 2 registers (4 bytes)
    if (
      response &&
      response.length >= 13 && // MBAP(7) + FC(1) + ByteCount(1) + Data(4) = 13
      response[7] === functionCode &&
      response[8] === 4 // Byte count should be 4
    ) {
      const value = response.readFloatBE(9); // Read as Big-Endian Float
      console.log(`[readCleaningHoursSetpoint] Decoded Float Value: ${value}`);
      return value;
    } else {
      throw new Error(
        `Invalid response for readCleaningHoursSetpoint: ${response?.toString(
          'hex',
        )}`,
      );
    }
  } catch (error: any) {
    if (error.message.includes('Modbus Exception 4')) {
      console.warn(
        '[readCleaningHoursSetpoint] Cleaning hours setpoint not set. Returning null.',
      );
      return null; // Return null if the setpoint is not set
    }
    throw error; // Re-throw other errors
  }
};

/**
 * Sets the Cleaning Hours Setpoint (Holding Register 2).
 */
export const setCleaningHoursSetpoint = (
  ip: string,
  port: number,
  value: number,
  setStatus?: (msg: string) => void,
): Promise<void> => {
  const startAddress = 2; // Holding Register 2
  const functionCode = 0x06; // Write Single Register (FC6)

  // Convert the float to IEEE 754 format
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value, 0);

  console.log(
    `[setCleaningHoursSetpoint] Writing float value ${value} (hex: ${buffer.toString(
      'hex',
    )})`,
  );

  // Write the first 16 bits (high word) to the starting register
  const highWord = buffer.readUInt16BE(0);
  const lowWord = buffer.readUInt16BE(2);

  const requestHigh = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress,
    highWord,
  );

  const requestLow = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress + 1,
    lowWord,
  );

  return sendModbusRequest(ip, port, requestHigh)
    .then(() => sendModbusRequest(ip, port, requestLow))
    .then(() => {
      if (setStatus) {
        setStatus(`Cleaning Hours Setpoint set to ${value} successfully.`);
      }
    })
    .catch(error => {
      const errorMsg = `Error setting Cleaning Hours Setpoint: ${error.message}`;

      console.error(`[setCleaningHoursSetpoint] ${errorMsg}`, error);
      throw error;
    });
};

/**
 * Reads the current cleaning run hours for a SINGLE lamp.
 */
export const readSingleLampCleaningRunHours = async (
  ip: string,
  port: number,
): Promise<number> => {
  const addressMap: {[key: number]: number} = {
    1: 24, // Input 24
  };
  const startAddress = addressMap[1];

  if (startAddress === undefined) {
    throw new Error(`Invalid lamp index provided for reading cleaning hours.`);
  }

  let cleaningHours = 0;

  // --- Read Cleaning Hours (FC04 - Input Registers) ---
  try {
    const quantity = 2; // Read 2 registers for float32
    const functionCode = 0x04;
    const request = createModbusRequest(
      MODBUS_UNIT_ID,
      functionCode,
      startAddress,
      quantity,
    );
    console.log(
      `[readSingleLampCleaningRunHours 1] Reading (FC04) @ ${startAddress}`,
    );
    const response = await sendModbusRequest(ip, port, request);

    if (
      response &&
      response.length >= 13 && // MBAP(7) + FC(1) + ByteCount(1) + Data(4) = 13
      response[7] === functionCode &&
      response[8] === 4 // Byte count should be 4
    ) {
      cleaningHours = response.readFloatBE(9); // Read as Big-Endian Float
      console.log(
        `[readSingleLampCleaningRunHours 1] Cleaning Hours Raw (Float): ${cleaningHours}`,
      );
    } else {
      throw new Error(
        `Invalid response for readSingleLampCleaningRunHours: ${response?.toString(
          'hex',
        )}`,
      );
    }
  } catch (error: any) {
    console.error(
      `[readSingleLampCleaningRunHours 1] Error reading cleaning hours: ${error.message}`,
    );
    throw error; // Rethrow the error to indicate failure
  }

  return cleaningHours;
};

/**
 * Resets the cleaning hours for ALL lamps by toggling Coils 11, 13, 15, 17.
 */
export const resetCleaningHours = async (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
): Promise<void> => {
  const addresses = [11, 13, 15, 17]; // Coils 11, 13, 15, 17
  const writeValueOn = 0xff00; // Value for ON
  const writeValueOff = 0x0000; // Value for OFF
  const functionCode = 0x05;
  const delayMs = 500; // Delay between ON and OFF as per notes

  setStatus('Resetting cleaning hours for all lamps (toggle sequence)...');
  let errorCount = 0;

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const lampNum = i + 1;
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

    try {
      // --- Step 1: Write ON ---
      setStatus(
        `Resetting Lamp ${lampNum} Clean Hours (Step 1/2: ON - Coil ${address})...`,
      );
      const dataOn = await sendModbusRequest(ip, port, requestOn);
      // Check response validity for ON command
      if (
        !(
          dataOn &&
          dataOn.length >= 12 &&
          dataOn[7] === functionCode &&
          dataOn.readUInt16BE(8) === address
        )
      ) {
        throw new Error(
          `Unexpected response during ON write: ${dataOn?.toString('hex')}`,
        );
      }
      setStatus(
        `Lamp ${lampNum} Clean Hours Reset ON command sent. Waiting ${delayMs}ms...`,
      );

      // --- Step 2: Wait ---
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // --- Step 3: Write OFF ---
      setStatus(
        `Resetting Lamp ${lampNum} Clean Hours (Step 2/2: OFF - Coil ${address})...`,
      );
      const dataOff = await sendModbusRequest(ip, port, requestOff);
      // Check response validity for OFF command
      if (
        !(
          dataOff &&
          dataOff.length >= 12 &&
          dataOff[7] === functionCode &&
          dataOff.readUInt16BE(8) === address
        )
      ) {
        throw new Error(
          `Unexpected response during OFF write: ${dataOff?.toString('hex')}`,
        );
      }
      setStatus(`Lamp ${lampNum} Clean Hours Reset OFF command sent.`);
    } catch (error: any) {
      errorCount++;
      // Make error message more specific about which step failed
      const step = error.message.includes('OFF write')
        ? 'Step 2 (OFF)'
        : 'Step 1 (ON) or connection';
      const detailedErrorMsg = `Error resetting Lamp ${lampNum} Clean Hours (${step}): ${error.message}`;
      setStatus(detailedErrorMsg);
      console.error(`[resetCleaningHours] ${detailedErrorMsg}`, error);
      // Decide whether to continue or stop on error
      // break; // Uncomment to stop on first error
    }
    // Optional small delay between lamps if needed
    // if (i < addresses.length - 1) { await new Promise(resolve => setTimeout(resolve, 100)); }
  }

  if (errorCount > 0) {
    throw new Error(
      `Finished resetting cleaning hours with ${errorCount} error(s).`,
    );
  }
  setStatus('All cleaning hours reset toggle sequences sent successfully.');
};

// --- Sensors Functions ---

/**
 * Read DPS Status (Discrete 17).
 */
const readDPS = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setDpsStatus: (isOk: boolean | null) => void,
) => {
  const address = 17; // Discrete 17
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus('Reading DPS Status...');
  sendModbusRequest(ip, port, request)
    .then(data => {
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
    })
    .catch(error => {
      setStatus(`Error reading DPS status: ${error.message}`);
      setDpsStatus(null);
    });
};

/**
 * Read Pressure Button / Limit Switch Status (Discrete 19).
 */
const readPressureButton = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  callback: (isOk: boolean | null) => void,
) => {
  const address = 19;
  const quantity = 1;
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x02, address, quantity);
  setStatus('Reading Pressure Button Status...');
  sendModbusRequest(ip, port, request)
    .then(data => {
      if (data && data.length >= 10 && data[8] === 1) {
        const statusBit = data[9] & 0x01;
        const isOk = statusBit === 1;
        setStatus(
          `Pressure Button Status: ${
            isOk ? 'OK' : 'Pressure Issue (Trigger Door Icon)'
          }`,
        );
        callback(isOk);
      } else {
        setStatus(
          `Error: Invalid response for read Pressure Button: ${data?.toString(
            'hex',
          )}`,
        );
      }
    })
    .catch(error => {
      setStatus(`Error reading Push Button status: ${error.message}`);
    });
};
/**
 * Read number of lamps online (Input 22).
 */
const readLampsOnline = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setLampsOnlineCount: (count: number | null) => void,
) => {
  const address = 22; // Input 22
  const quantity = 2; // Read 2 registers for float32 (matches Python)
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x04, address, quantity); // FC04 Read Input Registers
  setStatus('Reading Number of Lamps Online...');
  sendModbusRequest(ip, port, request)
    .then(data => {
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
    })
    .catch(error => {
      setStatus(`Error reading lamps online: ${error.message}`);
      setLampsOnlineCount(null);
    });
};

/**
 * Read Current Amps (CT) (Input 18).
 */
const readCurrentAmps = (
  ip: string,
  port: number,
  setStatus: (msg: string) => void,
  setCurrentAmpsValue: (amps: number | null) => void,
) => {
  const address = 18; // Input 18
  const quantity = 2; // Read 2 registers for float32 (matches Python)
  const request = createModbusRequest(MODBUS_UNIT_ID, 0x04, address, quantity);
  setStatus('Reading Current Amps (CT)...');
  sendModbusRequest(ip, port, request)
    .then(data => {
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
    })
    .catch(error => {
      setStatus(`Error reading current amps: ${error.message}`);
      setCurrentAmpsValue(null);
    });
};

/**
 * Read individual UV clean status (Discrete 1, 5, 9, 13).
 */
export const readLampCleanStatus = async (
  ip: string,
  port: number,
  lampIndex: number, // 1, 2, 3, or 4
): Promise<boolean> => {
  const addressMap: {[key: number]: number} = {
    1: 1, // Discrete 1
    2: 5, // Discrete 5
    3: 9, // Discrete 9
    4: 13, // Discrete 13
  };
  const address = addressMap[lampIndex];
  const quantity = 1;
  const functionCode = 0x02;
  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    address,
    quantity,
  );

  console.log(`[readLampCleanStatus ${lampIndex}] Reading (FC02) @ ${address}`);
  const response = await sendModbusRequest(ip, port, request);

  if (response && response.length >= 10 && response[8] === 1) {
    // FC=02, ByteCount=1
    const statusBit = response[9] & 0x01;
    const needsCleaning = statusBit === 1; // Assuming 1 = Needs Cleaning
    console.log(
      `[readLampCleanStatus ${lampIndex}] Needs Cleaning: ${needsCleaning}`,
    );
    return needsCleaning;
  } else {
    throw new Error(
      `Invalid response for readLampCleanStatus ${lampIndex}: ${response?.toString(
        'hex',
      )}`,
    );
  }
};

/**
 * Read individual UV life status (Input 3, 7, 11, 15).
 */
export const readLampLifeStatus = async (
  ip: string,
  port: number,
  lampIndex: number, // 1-based lamp index (1-4)
): Promise<number> => {
  const addressMap: {[key: number]: number} = {
    1: 3, // Input 3
    2: 7, // Input 7
    3: 11, // Input 11
    4: 15, // Input 15
  };
  const startAddress = addressMap[lampIndex];

  if (startAddress === undefined) {
    throw new Error(`Invalid lamp index ${lampIndex} for reading life status.`);
  }

  const quantity = 1; // Read 1 register (assuming 16-bit)
  const functionCode = 0x04; // Read Input Registers

  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress,
    quantity,
  );

  console.log(
    `[readLampLifeStatus ${lampIndex}] Reading Life Status (FC04) @ ${startAddress}`,
  );
  const response = await sendModbusRequest(ip, port, request);

  if (response && response.length >= 11 && response[8] === 2) {
    // FC=04, ByteCount=2
    const value = response.readUInt16BE(9);
    console.log(
      `[readLampLifeStatus ${lampIndex}] Life Status Raw Value: ${value}`,
    );
    return value;
  } else {
    throw new Error(
      `Invalid response for readLampLifeStatus Lamp ${lampIndex}: ${response?.toString(
        'hex',
      )}`,
    );
  }
};

/**
 * Read single coil working hours (Coil 8, 12, 16, 20).
 */
export const readSingleCoilWorkingHours = async (
  ip: string,
  port: number,
  coilIndex: number, // 1-based coil index
): Promise<number> => {
  const addressMap: {[key: number]: number} = {
    1: 8, // Coil 8
    2: 12, // Coil 12
    3: 16, // Coil 16
    4: 20, // Coil 20
  };
  const startAddress = addressMap[coilIndex];

  if (startAddress === undefined) {
    throw new Error(
      `Invalid coil index ${coilIndex} for reading working hours.`,
    );
  }

  const quantity = 1; // Read 1 coil
  const functionCode = 0x01; // Read Coils

  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress,
    quantity,
  );

  console.log(
    `[readSingleCoilWorkingHours ${coilIndex}] Reading (FC01) @ ${startAddress}`,
  );
  const response = await sendModbusRequest(ip, port, request);

  if (response && response.length >= 10 && response[8] === 1) {
    // FC=01, ByteCount=1
    const value = response[9] & 0x01; // Extract the single bit value
    console.log(
      `[readSingleCoilWorkingHours ${coilIndex}] Raw Value: ${value}`,
    );
    return value;
  } else {
    throw new Error(
      `Invalid response for readSingleCoilWorkingHours Coil ${coilIndex}: ${response?.toString(
        'hex',
      )}`,
    );
  }
};

/**
 * Read single coil cleaning hours (Coil 10, 14, 18, 22).
 */
export const readSingleCoilCleaningHours = async (
  ip: string,
  port: number,
  coilIndex: number, // 1-based coil index
): Promise<number> => {
  const addressMap: {[key: number]: number} = {
    1: 10, // Coil 10
    2: 14, // Coil 14
    3: 18, // Coil 18
    4: 22, // Coil 22
  };
  const startAddress = addressMap[coilIndex];

  if (startAddress === undefined) {
    throw new Error(
      `Invalid coil index ${coilIndex} for reading cleaning hours.`,
    );
  }

  const quantity = 1; // Read 1 coil
  const functionCode = 0x01; // Read Coils

  const request = createModbusRequest(
    MODBUS_UNIT_ID,
    functionCode,
    startAddress,
    quantity,
  );

  console.log(
    `[readSingleCoilCleaningHours ${coilIndex}] Reading (FC01) @ ${startAddress}`,
  );
  const response = await sendModbusRequest(ip, port, request);

  if (response && response.length >= 10 && response[8] === 1) {
    // FC=01, ByteCount=1
    const value = response[9] & 0x01; // Extract the single bit value
    console.log(
      `[readSingleCoilCleaningHours ${coilIndex}] Raw Value: ${value}`,
    );
    return value;
  } else {
    throw new Error(
      `Invalid response for readSingleCoilCleaningHours Coil ${coilIndex}: ${response?.toString(
        'hex',
      )}`,
    );
  }
};

// Correct final export block
export {readDPS, readPressureButton, readLampsOnline, readCurrentAmps};

// --- Cleanup ---
export const cleanupAllConnections = () => {
  TcpConnectionManager.getInstance().closeAllConnections();
};

// --- Memory Monitoring ---
// if (process.env.NODE_ENV === 'development') {
//   setInterval(() => {
//     const memoryUsage = process.memoryUsage();
//     console.log(`Memory usage:
//       RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB
//       HeapTotal: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB
//       HeapUsed: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
//   }, 5000);
// }
