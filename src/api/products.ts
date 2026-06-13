import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// Отримання всіх продуктів
router.get('/', async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, name, price_per_unit::FLOAT, waste_percentage::FLOAT, item_number, unit
            FROM products
            ORDER BY id DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Створення нового продукту
router.post('/', async (req: Request, res: Response) => {
    const { name, price_per_unit, waste_percentage, item_number, unit } = req.body;

    if (!name || price_per_unit === undefined || waste_percentage === undefined || !item_number || !unit) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const query = `
            INSERT INTO products (name, price_per_unit, waste_percentage, item_number, unit)
            VALUES ($1, $2, $3, $4, $5)
                RETURNING id, name, price_per_unit::FLOAT, waste_percentage::FLOAT, item_number, unit
        `;
        const result = await pool.query(query, [name, price_per_unit, waste_percentage, item_number, unit]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Оновлення наявного продукту
router.put('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, price_per_unit, waste_percentage, item_number, unit } = req.body;

    if (!name || price_per_unit === undefined || waste_percentage === undefined || !item_number || !unit) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const query = `
            UPDATE products
            SET name = $1, price_per_unit = $2, waste_percentage = $3, item_number = $4, unit = $5
            WHERE id = $6
                RETURNING id, name, price_per_unit::FLOAT, waste_percentage::FLOAT, item_number, unit
        `;
        const result = await pool.query(query, [name, price_per_unit, waste_percentage, item_number, unit, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Видалення продукту
router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const query = 'DELETE FROM products WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: 'Product deleted successfully', id: result.rows[0].id });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;