import { openDB } from 'idb';

const DB_NAME = 'timeline-db';
const STORE_NAME = 'events';

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

export const getAllEvents = async () => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};

export const saveEvent = async (event) => {
  const db = await initDB();
  return db.put(STORE_NAME, event);
};

export const deleteEventById = async (id) => {
  const db = await initDB();
  return db.delete(STORE_NAME, id);
};

export const clearAllEvents = async () => {
  const db = await initDB();
  return db.clear(STORE_NAME);
};

// For bulk import/replace
export const saveAllEvents = async (events) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.clear();
  for (const event of events) {
    await tx.store.put(event);
  }
  await tx.done;
};
