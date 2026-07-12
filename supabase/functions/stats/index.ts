import postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"

const databaseUrl = Deno.env.get("DB_DIRECT_URL")!
const pool = new postgres.Pool(databaseUrl, 3, true)

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const client = await pool.connect();

    try {
        const dishesCountRes = await client.queryObject<{ count: string }>("SELECT COUNT(*) FROM dishes");
        const productsCountRes = await client.queryObject<{ count: string }>("SELECT COUNT(*) FROM products");

        return new Response(JSON.stringify({
            total_dishes: parseInt(dishesCountRes.rows[0].count, 10),
            total_products: parseInt(productsCountRes.rows[0].count, 10),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    } finally {
        client.release();
    }
});