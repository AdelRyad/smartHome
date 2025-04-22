import SQLite from 'react-native-sqlite-storage';

interface Section {
  id?: number;
  name: string;
  ip: string;
  connected: boolean;
  working: boolean;
  cleaningDays: number;
  devices: Device[];
}

interface Device {
  id?: number;
  sectionId: number;
  name: string;
  ip: string;
  workingHours: number;
}

interface ContactInfo {
  id?: number;
  name: string;
  email: string;
  phone: string;
  projectRefrence: string;
  hoodRefrence: string;
  commissionDate: string;
}

const getDatabase = async () => {
  return await SQLite.openDatabase({name: 'smarthome.db', location: 'default'});
};

// Initialize the database
const initDatabase = async (): Promise<void> => {
  const db = await getDatabase();
  db.transaction(tx => {
    console.log('Initializing database...');

    // Create sections table
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        ip TEXT DEFAULT '',
        working INTEGER DEFAULT 0,
        cleaningDays INTEGER DEFAULT 14
      );`,
    );

    // Create devices table
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sectionId INTEGER,
        name TEXT,
        ip TEXT DEFAULT '',
        workingHours INTEGER DEFAULT 8000,
        FOREIGN KEY (sectionId) REFERENCES sections(id)
      );`,
    );

    // Create contact_info table (Fixed missing commas)
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS contact_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        phone TEXT,
        project_refrence TEXT,
        hood_refrence TEXT,
        commission_date TEXT
      );`,
    );

    // Ensure necessary columns exist
    const ensureColumnExists = (
      table: string,
      columnName: string,
      columnType: string,
      defaultValue: string,
    ) => {
      tx.executeSql(`PRAGMA table_info(${table});`, [], (_, results) => {
        const columns = Array.from(
          {length: results.rows.length},
          (_, i) => results.rows.item(i).name,
        );
        console.log(`Columns in ${table}:`, columns);

        if (!columns.includes(columnName)) {
          tx.executeSql(
            `ALTER TABLE ${table} ADD COLUMN ${columnName} ${columnType} DEFAULT ${defaultValue};`,
          );
        }
      });
    };

    ensureColumnExists('sections', 'working', 'INTEGER', '0');
    ensureColumnExists('sections', 'cleaningDays', 'INTEGER', '14');

    // Insert default sections and devices if none exist
    tx.executeSql(
      'SELECT COUNT(*) AS count FROM sections;',
      [],
      (_, results) => {
        const count = results.rows.item(0).count;
        if (count === 0) {
          console.log('Inserting default sections and devices...');
          for (let i = 1; i <= 8; i++) {
            tx.executeSql(
              'INSERT INTO sections (name, ip, working, cleaningDays) VALUES (?, ?, ?, ?);',
              [`Section ${i}`, '', 0, 14], // Fixed cleaningDays default
            );
          }

          tx.executeSql('SELECT id FROM sections;', [], (_, sectionResults) => {
            for (let i = 0; i < sectionResults.rows.length; i++) {
              const sectionId = sectionResults.rows.item(i).id;
              for (let j = 1; j <= 6; j++) {
                tx.executeSql(
                  `INSERT INTO devices (sectionId, name, ip, workingHours) VALUES (?, ?, ?, ?);`,
                  [sectionId, `Device ${j}`, '', 8000], // Fixed missing workingHours value
                );
              }
            }
          });
        }
      },
    );

    // Insert default contact info if none exist
    tx.executeSql(
      'SELECT COUNT(*) AS count FROM contact_info;',
      [],
      (_, results) => {
        const count = results.rows.item(0).count;
        if (count === 0) {
          console.log('Inserting default contact info...');
          tx.executeSql(
            'INSERT INTO contact_info (name, email, phone, project_refrence, hood_refrence, commission_date) VALUES (?, ?, ?, ?, ?, ?);',
            [
              'Admin',
              'admin@example.com',
              '123-456-7890',
              'Project Refrence',
              'Hood Refrence',
              '2025-01-01',
            ],
          );
        }
      },
    );
  });
};

// Fetch sections
const getSectionsWithStatus = async (
  callback: (sections: Section[]) => void,
): Promise<void> => {
  const db = await getDatabase();
  db.transaction(tx => {
    tx.executeSql(
      'SELECT id, name, ip, cleaningDays FROM sections;',
      [],
      (_, results) => {
        const sections: Section[] = [];
        for (let i = 0; i < results.rows.length; i++) {
          const item = results.rows.item(i);
          sections.push({
            id: item.id,
            name: item.name,
            ip: item.ip,
            cleaningDays: item.cleaningDays,
            connected: false,
            working: false,
            devices: [],
          });
        }
        callback(sections);
      },
    );
  });
};

// Update device status
const updateSectionDeviceStatus = async (
  deviceId: number,
  workingHours: number,
  callback: (success: boolean) => void,
): Promise<void> => {
  const db = await getDatabase();
  db.transaction(tx => {
    tx.executeSql(
      'UPDATE devices SET workingHours = ? WHERE id = ?;',
      [workingHours, deviceId],
      () => callback(true),
      (_, error) => {
        console.error('SQL error:', error);
        callback(false);
        return false;
      },
    );
  });
};

// Update a section
const updateSection = async (
  sectionId: number,
  name: string,
  ip: string,
  cleaningDays: number,
  working: boolean,
  callback: (success: boolean) => void,
): Promise<void> => {
  const db = await getDatabase();
  db.transaction(tx => {
    tx.executeSql(
      'UPDATE sections SET name = ?, ip = ?, cleaningDays = ?, working = ? WHERE id = ?;',
      [name, ip, cleaningDays, working, sectionId],
      () => callback(true),
      () => {
        callback(false);
        return false;
      },
    );
  });
};

// Fetch devices for a section
const getDevicesForSection = async (
  sectionId: number,
  callback: (devices: Device[]) => void,
): Promise<void> => {
  const db = await getDatabase();
  db.transaction(tx => {
    tx.executeSql(
      'SELECT * FROM devices WHERE sectionId = ?;',
      [sectionId],
      (_, results) => {
        const devices: Device[] = [];
        for (let i = 0; i < results.rows.length; i++) {
          const item = results.rows.item(i);
          devices.push(item);
        }
        callback(devices);
      },
    );
  });
};

// Add contact info
const addContactInfo = async (
  name: string,
  email: string,
  phone: string,
  projectRefrence: string,
  hoodRefrence: string,
  commissionDate: string,
  callback: (success: boolean) => void,
): Promise<void> => {
  const db = await getDatabase();
  db.transaction(tx => {
    tx.executeSql(
      'INSERT INTO contact_info (name, email, phone, project_refrence, hood_refrence, commission_date) VALUES (?, ?, ?, ?, ?, ?);',
      [name, email, phone, projectRefrence, hoodRefrence, commissionDate],
      () => callback(true),
      () => {
        callback(false);
        return false;
      },
    );
  });
};

// Fetch contact info
const getContactInfo = async (
  callback: (contact: ContactInfo) => void,
): Promise<void> => {
  const db = await getDatabase();
  db.transaction(tx => {
    tx.executeSql('SELECT * FROM contact_info;', [], (_, results) => {
      callback(results.rows.item(0));
    });
  });
};

// Update contact info (assuming only one row, identified by id=1 or similar)
export const updateContactInfo = async (
  contact: ContactInfo, // Use local ContactInfo type
  callback: (success: boolean) => void,
) => {
  const db = await getDatabase(); // Get DB instance
  db.transaction(tx => {
    tx.executeSql(
      `UPDATE contact_info
       SET email = ?, phone = ?, project_refrence = ?, hood_refrence = ?, commission_date = ?
       WHERE id = 1;`, // Use snake_case column names, adjust WHERE if needed
      [
        contact.email,
        contact.phone,
        contact.projectRefrence, // Value from object (camelCase)
        contact.hoodRefrence, // Value from object (camelCase)
        contact.commissionDate, // Value from object (camelCase)
      ],
      (_, resultSet) => {
        // Check if the update was successful (e.g., rowsAffected > 0)
        if (resultSet.rowsAffected > 0) {
          console.log('Contact info updated successfully in DB');
          callback(true);
        } else {
          // Handle case where row wasn't found or update didn't happen
          console.warn('Contact info update did not affect any rows.');
          // Decide if this is a success or failure based on your logic
          callback(false); // Or true if not finding the row is acceptable
        }
      },
      (_, error) => {
        // SQL error
        console.error('Error updating contact info:', error);
        callback(false);
        return false; // Indicate transaction failure
      },
    );
  });
};

export {
  getDatabase,
  initDatabase,
  getSectionsWithStatus,
  updateSectionDeviceStatus,
  updateSection,
  getDevicesForSection,
  addContactInfo,
  getContactInfo,
};
