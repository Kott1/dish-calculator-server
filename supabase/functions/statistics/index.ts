import postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"

const databaseUrl = Deno.env.get("DB_DIRECT_URL")!
const pool = new postgres.Pool(databaseUrl, 3, true)

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "month";
    const allowedRanges = ["day", "week", "month", "year"];
    const targetRange = allowedRanges.includes(range) ? range : "month";

    const whereClause = `WHERE c.calculated_at >= DATE_TRUNC('${targetRange}', NOW())`;
    const client = await pool.connect();

    try {
        const dishesQuery = `SELECT cd.dish_name as name, SUM(cd.quantity)::INT as value FROM calculation_dishes cd JOIN calculations c ON cd.calculation_id = c.id ${whereClause} GROUP BY cd.dish_name ORDER BY value DESC LIMIT 10`;
        const productsQuery = `SELECT cp.product_name as name, SUM(cp.total_amount)::FLOAT as value, cp.unit FROM calculation_products cp JOIN calculations c ON cp.calculation_id = c.id ${whereClause} GROUP BY cp.product_name, cp.unit ORDER BY value DESC LIMIT 10`;
        const expensesQuery = `SELECT COALESCE(SUM(c.total_cost), 0)::FLOAT as total_expenses FROM calculations c ${whereClause}`;

        const [dishesRes, productsRes, expensesRes] = await Promise.all([
            client.queryObject<{ name: string; value: number }>(dishesQuery),
            client.queryObject<{ name: string; value: number; unit: string }>(productsQuery),
            client.queryObject<{ total_expenses: number }>(expensesQuery),
        ]);

        return new Response(JSON.stringify({
            total_expenses: expensesRes.rows[0].total_expenses,
            dishes: dishesRes.rows,
            products: productsRes.rows
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    } finally {
        client.release();
    }
});