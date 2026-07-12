import postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts"
import { corsHeaders } from "../_shared/cors.ts"

const databaseUrl = Deno.env.get("DB_DIRECT_URL")!
const pool = new postgres.Pool(databaseUrl, 3, true)

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const segments = new URL(req.url).pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 1];
    const isResourceId = id && !isNaN(Number(id)) && segments.length > 2;
    const client = await pool.connect();

    try {
        // POST /calculations
        if (req.method === "POST") {
            const { tax_percent, total_cost, dishes, products } = await req.json();

            if (!dishes || !Array.isArray(dishes) || dishes.length === 0 || total_cost === undefined) {
                return new Response(JSON.stringify({ error: "Invalid payload data" }), { headers: corsHeaders, status: 400 });
            }

            const transaction = client.createTransaction("save_calculation");
            await transaction.begin();

            const calcResult = await transaction.queryObject<{ id: number }>(
                `INSERT INTO calculations (tax_percent, total_cost) VALUES ($1, $2) RETURNING id`,
                [parseFloat(tax_percent) || 0, total_cost]
            );
            const calcId = calcResult.rows[0].id;

            for (const dish of dishes) {
                await transaction.queryObject(
                    `INSERT INTO calculation_dishes (calculation_id, dish_id, dish_name, quantity, total_cost) VALUES ($1, $2, $3, $4, $5)`,
                    [calcId, dish.dish_id, dish.dish_name, dish.quantity, dish.total_cost]
                );
            }

            for (const prod of products) {
                await transaction.queryObject(
                    `INSERT INTO calculation_products (calculation_id, product_id, product_name, total_amount, unit, total_cost) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [calcId, prod.product_id, prod.product_name, prod.total_amount, prod.unit, prod.total_cost]
                );
            }

            await transaction.commit();
            return new Response(JSON.stringify({ success: true, calculationId: calcId }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 201
            });
        }

        // GET /calculations
        if (req.method === "GET") {
            const result = await client.queryObject(`
        SELECT 
          c.id, c.calculated_at, c.tax_percent, c.total_cost::FLOAT,
          COALESCE((SELECT json_agg(cd) FROM calculation_dishes cd WHERE cd.calculation_id = c.id), '[]') as dishes,
          COALESCE((SELECT json_agg(cp) FROM calculation_products cp WHERE cp.calculation_id = c.id), '[]') as products
        FROM calculations c ORDER BY c.calculated_at DESC
      `);
            return new Response(JSON.stringify(result.rows), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200
            });
        }

        // DELETE /calculations/:id
        if (req.method === "DELETE" && isResourceId) {
            const transaction = client.createTransaction("delete_calculation");
            await transaction.begin();

            await transaction.queryObject(`DELETE FROM calculation_dishes WHERE calculation_id = $1`, [Number(id)]);
            await transaction.queryObject(`DELETE FROM calculation_products WHERE calculation_id = $1`, [Number(id)]);
            const deleteCalc = await transaction.queryObject(`DELETE FROM calculations WHERE id = $1 RETURNING id`, [Number(id)]);

            if (deleteCalc.rows.length === 0) {
                await transaction.rollback();
                return new Response(JSON.stringify({ error: "Calculation session not found" }), { headers: corsHeaders, status: 404 });
            }

            await transaction.commit();
            return new Response(JSON.stringify({ success: true, message: "Deleted successfully" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200
            });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), { headers: corsHeaders, status: 405 });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    } finally {
        client.release();
    }
});