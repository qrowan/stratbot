import { promises as fs } from 'fs';
import path from 'path';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function saveDataToFile<T>(data: T, filePath: string): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save data to ${filePath}:`, error);
    throw error;
  }
}

export async function loadDataFromFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File ${filePath} not found, using default value`);
      return defaultValue;
    }
    console.error(`Failed to load data from ${filePath}:`, error);
    return defaultValue;
  }
}