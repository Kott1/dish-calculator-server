import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// Отримання всіх страв
router.get('/', async (req: Request, res: Response) => {
    try {
        const queryText = `
            SELECT
                d.id,
                d.name,
                COUNT(dp.product_id)::INT as products_count,
                COALESCE(v.live_cost, 0)::FLOAT as total_cost
            FROM dishes d
                     LEFT JOIN dish_products dp ON d.id = dp.dish_id
                     LEFT JOIN view_dish_live_costs v ON d.id = v.dish_id
            GROUP BY d.id, d.name, v.live_cost
            ORDER BY d.id DESC
        `;
        const result = await pool.query(queryText);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching dishes:', error);
        res.status(500).json({ error: 'Server error fetching dishes' });
    }
});

// Отримання деталей страви
router.get('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const queryText = `
            SELECT
                d.id,
                d.name,
                COALESCE(
                        json_agg(
                                json_build_object(
                                        'id', p.id,
                                        'name', p.name,
                                        'amount', (dp.amount / (1 + COALESCE(dp.waste_percentage, 0) / 100.0))::FLOAT,
                                        'gross_amount', dp.amount::FLOAT,
                                        'unit', dp.unit,
                                        'waste_percentage', dp.waste_percentage,
                                        'price_per_unit', p.price_per_unit::FLOAT,
                                        'product_unit', p.unit
                                )
                        ) FILTER (WHERE p.id IS NOT NULL), '[]'
                ) as ingredients
            FROM dishes d
                     LEFT JOIN dish_products dp ON d.id = dp.dish_id
                     LEFT JOIN products p ON dp.product_id = p.id
            WHERE d.id = $1
            GROUP BY d.id, d.name
        `;
        const result = await pool.query(queryText, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dish not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching dish details:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Створення нової страви
router.post('/', async (req: Request, res: Response) => {
    const { name, products } = req.body;

    if (!name || !products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'Invalid payload data' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const dishResult = await client.query(
            'INSERT INTO dishes (name) VALUES ($1) RETURNING id',
            [name.trim()]
        );
        const newDishId = dishResult.rows[0].id;

        const insertIngredientQuery = `
            INSERT INTO dish_products (dish_id, product_id, amount, unit, waste_percentage)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const prod of products) {
            let netAmount = parseFloat(prod.amount) || 0;
            let finalUnit = prod.unit;
            const wastePercent = parseFloat(prod.waste_percentage) || 0;

            if ((finalUnit === 'g' || finalUnit === 'ml') && netAmount >= 1000) {
                netAmount = netAmount / 1000;
                finalUnit = finalUnit === 'g' ? 'kg' : 'l';
            }

            const grossAmount = netAmount * (1 + wastePercent / 100);

            await client.query(insertIngredientQuery, [
                newDishId,
                prod.id,
                grossAmount,
                finalUnit,
                wastePercent
            ]);
        }
        await client.query('COMMIT');
        res.status(201).json({ success: true, dishId: newDishId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving dish:', error);
        res.status(500).json({ error: 'Server error saving dish' });
    } finally {
        client.release();
    }
});

// Оновлення наявної страви
router.put('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, products } = req.body;

    if (!name || !products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'Invalid payload data' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('UPDATE dishes SET name = $1 WHERE id = $2', [name.trim(), id]);
        await client.query('DELETE FROM dish_products WHERE dish_id = $1', [id]);

        const insertIngredientQuery = `
            INSERT INTO dish_products (dish_id, product_id, amount, unit, waste_percentage)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const prod of products) {
            let netAmount = parseFloat(prod.amount) || 0;
            let finalUnit = prod.unit;
            const wastePercent = parseFloat(prod.waste_percentage) || 0;

            if ((finalUnit === 'g' || finalUnit === 'ml') && netAmount >= 1000) {
                netAmount = netAmount / 1000;
                finalUnit = finalUnit === 'g' ? 'kg' : 'l';
            }

            const grossAmount = netAmount * (1 + wastePercent / 100);

            await client.query(insertIngredientQuery, [
                id,
                prod.id,
                grossAmount,
                finalUnit,
                wastePercent
            ]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating dish:', error);
        res.status(500).json({ error: 'Server error updating dish' });
    } finally {
        client.release();
    }
});

// Видалення страви
router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM dishes WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting dish:', error);
        res.status(500).json({ error: 'Server error deleting dish' });
    }
});

export default router;