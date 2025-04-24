import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import { parentPort } from 'worker_threads'; // Use parentPort for communication

// --- Define Shared Types ---
interface ModbusRequestQueueItem {
  ip: string;
  port: number;
  request: Buffer;
  requestId: string; // Unique ID to link request and response
  retries: number;
  backoffDelay: number;
}

// --- Configuration ---
const MODBUS_UNIT_ID = 1;
const MAX_RETRIES = 3; // Maximum number of retries
const MAX_CONCURRENT_REQUESTS = 1; // Limit the number of concurrent requests
const REQUEST_TIMEOUT = 5000; // 5-second timeout

// --- Modbus Request Queue ---
const requestQueue: ModbusRequestQueueItem[] = [];
let activeRequests = 0;

// --- Helper Functions ---

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

    const quantity = writeData.length / 2; // Number of 16-bit registers
    const byteCount = writeData.length;
    pdu = Buffer.alloc(6 + byteCount);
    pdu.writeUInt8(functionCode, 0);
    pdu.writeUInt16BE(startAddress, 1);
    pdu.writeUInt16BE(quantity, 3);
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
 * Sends a Modbus request via TCP socket and returns a Promise resolving with the response Buffer.
 * Includes timeout and exception handling.
 * This function is designed to run WITHIN the worker thread.
 */
const executeModbusRequest = (
  queueItem: ModbusRequestQueueItem,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const { ip, port, request, requestId } = queueItem;

    const client = TcpSocket.createConnection({ host: ip, port }, () => {
      //write data to socket
      client.write(
        new Uint8Array(request.buffer, request.byteOffset, request.byteLength),
      );
    });

    let responseBuffer = Buffer.alloc(0);
    let requestTimeout: NodeJS.Timeout | null = null;

    const cleanup = (error?: Error) => {
      if (requestTimeout) {
        clearTimeout(requestTimeout);
        requestTimeout = null;
      }
      if (!client.destroyed) {
        client.destroy();
      }

      // This cleanup is per request, not per queue processing cycle.
      // processQueue() should be called after a request finishes.
    };

    requestTimeout = setTimeout(() => {
      cleanup(); // Clean up socket before rejecting
      reject(new Error('Modbus request timed out'));
    }, REQUEST_TIMEOUT); // 5 second timeout

    client.on('data', (data) => {
      if (client.destroyed) return;

      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      responseBuffer = Buffer.concat([responseBuffer, dataBuffer]);

      if (responseBuffer.length >= 6) {
        // Minimum MBAP header length
        const expectedLengthMBAP = responseBuffer.readUInt16BE(4);
        const totalExpectedLength = 6 + expectedLengthMBAP; // Correct total length

        if (responseBuffer.length >= totalExpectedLength) {
          cleanup(); // Received full response, clear timeout and destroy client

          // Check for Modbus Exception Response
          if (responseBuffer.length >= 8 && responseBuffer[7] & 0x80) {
            const functionCode = responseBuffer[7] & 0x7f;
            const exceptionCode = responseBuffer[8];
            reject(
              new Error(
                `Modbus Exception ${exceptionCode} for function ${functionCode}`,
              ),
            );
          } else {
            // Success!
            resolve(responseBuffer);
          }
        }
        // Else: Wait for more data or timeout
      }
    });

    client.on('error', (error) => {
      cleanup(); // Clean up on error
      reject(new Error(`Connection error: ${error.message || error}`));
    });

    client.on('close', () => {
       // The socket closed. If the promise is still pending, this indicates an issue.
       // The timeout and error handlers should cover most cases, but add a check here
       // to reject if the promise hasn't been resolved/rejected yet.
        if (requestTimeout !== null) { // Check if timeout hasn't been cleared (meaning promise not resolved/rejected)
             cleanup(); // Clean up socket
             reject(new Error("Modbus connection closed unexpectedly"));
        }
    });
  });
};

/**
 * Processes the next request in the queue.
 */
const processQueue = async () => {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
    return; // Max concurrent requests reached or queue is empty
  }

  activeRequests++;
  const queueItem = requestQueue.shift()!; // Dequeue the next item

  try {
    const response = await executeModbusRequest(queueItem);
    // Send success message back to the main thread
    parentPort?.postMessage({
      type: 'success',
      requestId: queueItem.requestId,
      response: Array.from(response), // Convert Buffer to array for transfer
    });
  } catch (error: any) {
    // Handle retries
    if (queueItem.retries < MAX_RETRIES && error.message.includes('Connection error') || error.message.includes('timed out') || error.message.includes('closed unexpectedly')) {
      console.warn(
        `Request ${queueItem.requestId} failed (${error.message}), retrying (${queueItem.retries + 1}/${MAX_RETRIES})...`,
      );
      queueItem.retries++;
      queueItem.backoffDelay *= 2; // Exponential backoff
      // Prevent excessive backoff delay
      if (queueItem.backoffDelay > 30000) { // Cap backoff at 30 seconds
          queueItem.backoffDelay = 30000;
      }
      setTimeout(() => {
        requestQueue.unshift(queueItem); // Add back to the front of the queue
        processQueue(); // Attempt to process again after delay
      }, queueItem.backoffDelay);
    } else {
      console.error(
        `Request ${queueItem.requestId} failed after ${MAX_RETRIES} retries: ${error.message}`,
      );
      // Send error message back to the main thread
      parentPort?.postMessage({
        type: 'error',
        requestId: queueItem.requestId,
        error: error.message,
      });
    }
  } finally {
    activeRequests--;
    // Always attempt to process the next item after one finishes (or retries are exhausted)
    processQueue();
  }
};

// Listen for messages from the main thread
parentPort?.on('message', (message: { ip: string; port: number; requestData: number[]; requestId: string }) => {
    const { ip, port, requestData, requestId } = message;
    const requestBuffer = Buffer.from(requestData); // Convert array back to Buffer

    // Add the incoming request to the queue
    requestQueue.push({
        ip,
        port,
        request: requestBuffer,
        requestId,
        retries: 0, // Start with 0 retries
        backoffDelay: 1000, // Initial backoff delay
    });

    // Start processing the queue if not already at max concurrency
    processQueue();
});

console.log("Modbus worker started."); // Log to confirm worker starts
