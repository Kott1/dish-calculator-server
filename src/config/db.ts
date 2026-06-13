import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Помилка підключення до бази даних:', err.stack);
    }
    console.log('Підключено до PostgreSQL через TypeScript.');
    if (release) release();
});

export default pool;