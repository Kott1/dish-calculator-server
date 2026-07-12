import postgres from "postgres"
import { corsHeaders } from "shared/cors"

const databaseUrl = Deno.env.get("DB_DIRECT_URL")!
const pool = new postgres.Pool(databaseUrl, 3, true)

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const segments = new URL(req.url).pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 1];
    const isResourceId = id && !isNaN(Number(id)) && segments.length > 2;

    const client = await pool.connect();

    try {
        // GET /products
        if (req.method === "GET") {
            const result = await client.queryObject(`
        SELECT id, name, price_per_unit::FLOAT, waste_percentage::FLOAT, item_number, unit
        FROM products ORDER BY id DESC
      `);
            return new Response(JSON.stringify(result.rows), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200
            });
        }

        // POST /products
        if (req.method === "POST") {
            const { name, price_per_unit, waste_percentage, item_number, unit } = await req.json();
            if (!name || price_per_unit === undefined || waste_percentage === undefined || !item_number || !unit) {
                return new Response(JSON.stringify({ error: "Missing required fields" }), { headers: corsHeaders, status: 400 });
            }

            const result = await client.queryObject(`
        INSERT INTO products (name, price_per_unit, waste_percentage, item_number, unit)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, price_per_unit::FLOAT, waste_percentage::FLOAT, item_number, unit
      `, [name, price_per_unit, waste_percentage, item_number, unit]);

            return new Response(JSON.stringify(result.rows[0]), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 201 });
        }

        // PUT /products/:id
        if (req.method === "PUT" && isResourceId) {
            const { name, price_per_unit, waste_percentage, item_number, unit } = await req.json();
            const result = await client.queryObject(`
        UPDATE products
        SET name = $1, price_per_unit = $2, waste_percentage = $3, item_number = $4, unit = $5
        WHERE id = $6
        RETURNING id, name, price_per_unit::FLOAT, waste_percentage::FLOAT, item_number, unit
      `, [name, price_per_unit, waste_percentage, item_number, unit, Number(id)]);

            if (result.rows.length === 0) {
                return new Response(JSON.stringify({ error: "Product not found" }), { headers: corsHeaders, status: 404 });
            }
            return new Response(JSON.stringify(result.rows[0]), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }

        // DELETE /products/:id
        if (req.method === "DELETE" && isResourceId) {
            const result = await client.queryObject(`DELETE FROM products WHERE id = $1 RETURNING id`, [Number(id)]);
            if (result.rows.length === 0) {
                return new Response(JSON.stringify({ error: "Product not found" }), { headers: corsHeaders, status: 404 });
            }
            return new Response(JSON.stringify({ message: "Product deleted successfully", id: result.rows[0].id }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), { headers: corsHeaders, status: 405 });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    } finally {
        client.release();
    }
});