import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// Отримання періодичної аналітики (витрати, топ продуктів та страв)
router.get('/', async (req: Request, res: Response) => {
    const range = (req.query.range as string) || 'month';
    const allowedRanges = ['day', 'week', 'month', 'year'];
    const targetRange = allowedRanges.includes(range) ? range : 'month';

    const whereClause = `WHERE c.calculated_at >= DATE_TRUNC('${targetRange}', NOW())`;

    try {
        const dishesQuery = `
            SELECT cd.dish_name as name, SUM(cd.quantity)::INT as value
            FROM calculation_dishes cd
                JOIN calculations c ON cd.calculation_id = c.id
                ${whereClause}
            GROUP BY cd.dish_name
            ORDER BY value DESC
                LIMIT 10
        `;

        const productsQuery = `
            SELECT cp.product_name as name, SUM(cp.total_amount)::FLOAT as value, cp.unit
            FROM calculation_products cp
                JOIN calculations c ON cp.calculation_id = c.id
                ${whereClause}
            GROUP BY cp.product_name, cp.unit
            ORDER BY value DESC
                LIMIT 10
        `;

        const expensesQuery = `
            SELECT COALESCE(SUM(c.total_cost), 0)::FLOAT as total_expenses
            FROM calculations c
                ${whereClause}
        `;

        const [dishesRes, productsRes, expensesRes] = await Promise.all([
            pool.query(dishesQuery),
            pool.query(productsQuery),
            pool.query(expensesQuery)
        ]);

        res.json({
            total_expenses: expensesRes.rows[0].total_expenses,
            dishes: dishesRes.rows,
            products: productsRes.rows
        });
    } catch (error) {
        console.error('Error compiling statistics framework:', error);
        res.status(500).json({ error: 'Server error generating statistics logs' });
    }
});

export default router;