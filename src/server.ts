import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import productsRouter from './api/products';
import dishesRouter from './api/dishes';
import statsRouter from './api/stats';
import calculationsRouter from './api/calculations';
import statisticsRouter from './api/statistics';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/products', productsRouter);
app.use('/api/dishes', dishesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/calculations', calculationsRouter);
app.use('/api/statistics', statisticsRouter);

app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});