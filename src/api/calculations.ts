import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// Збереження розрахунку в історію та статистику
router.post('/', async (req: Request, res: Response) => {
    const { tax_percent, total_cost, dishes, products } = req.body;

    if (!dishes || !Array.isArray(dishes) || dishes.length === 0 || total_cost === undefined) {
        return res.status(400).json({ error: 'Invalid payload data' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const calcResult = await client.query(
            'INSERT INTO calculations (tax_percent, total_cost) VALUES ($1, $2) RETURNING id',
            [parseFloat(tax_percent) || 0, total_cost]
        );
        const calcId = calcResult.rows[0].id;

        const insertDishQuery = `
            INSERT INTO calculation_dishes (calculation_id, dish_id, dish_name, quantity, total_cost)
            VALUES ($1, $2, $3, $4, $5)
        `;
        for (const dish of dishes) {
            await client.query(insertDishQuery, [
                calcId,
                dish.dish_id,
                dish.dish_name,
                dish.quantity,
                dish.total_cost
            ]);
        }

        const insertProductQuery = `
            INSERT INTO calculation_products (calculation_id, product_id, product_name, total_amount, unit, total_cost)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        for (const prod of products) {
            await client.query(insertProductQuery, [
                calcId,
                prod.product_id,
                prod.product_name,
                prod.total_amount,
                prod.unit,
                prod.total_cost
            ]);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, calculationId: calcId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving calculation history:', error);
        res.status(500).json({ error: 'Server error saving calculation log' });
    } finally {
        client.release();
    }
});

// Отримання всієї історії розрахунків
router.get('/', async (req: Request, res: Response) => {
    try {
        const queryText = `
            SELECT
                c.id,
                c.calculated_at,
                c.tax_percent,
                c.total_cost::FLOAT,
                COALESCE(
                        (SELECT json_agg(cd) FROM calculation_dishes cd WHERE cd.calculation_id = c.id), '[]'
                ) as dishes,
                COALESCE(
                        (SELECT json_agg(cp) FROM calculation_products cp WHERE cp.calculation_id = c.id), '[]'
                ) as products
            FROM calculations c
            ORDER BY c.calculated_at DESC
        `;
        const result = await pool.query(queryText);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching calculations history:', error);
        res.status(500).json({ error: 'Server error fetching history logs' });
    }
});

// Повне видалення розрахунку з бази даних
router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('DELETE FROM calculation_dishes WHERE calculation_id = $1', [id]);
        await client.query('DELETE FROM calculation_products WHERE calculation_id = $1', [id]);

        const deleteCalc = await client.query('DELETE FROM calculations WHERE id = $1', [id]);

        if (deleteCalc.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Calculation session not found' });
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Calculation deleted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting calculation log:', error);
        res.status(500).json({ error: 'Server error deleting history log' });
    } finally {
        client.release();
    }
});

export default router;