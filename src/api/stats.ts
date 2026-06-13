import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// Загальна кількість сутностей (страви, продукти) для головного дашборду
router.get('/', async (req: Request, res: Response) => {
    try {
        const dishesCountRes = await pool.query('SELECT COUNT(*) FROM dishes');
        const productsCountRes = await pool.query('SELECT COUNT(*) FROM products');

        res.json({
            total_dishes: parseInt(dishesCountRes.rows[0].count),
            total_products: parseInt(productsCountRes.rows[0].count),
        });
    } catch (error) {
        console.error('Помилка отримання статистики:', error);
        res.status(500).json({ error: 'Помилка сервера при отриманні статистики' });
    }
});

export default router;