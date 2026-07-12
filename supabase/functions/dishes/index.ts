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
        // GET /dishes або /dishes/:id
        if (req.method === "GET") {
            if (isResourceId) {
                const queryText = `
          SELECT d.id, d.name,
            COALESCE(json_agg(json_build_object(
              'id', p.id, 'name', p.name,
              'amount', (dp.amount / (1 + COALESCE(dp.waste_percentage, 0) / 100.0))::FLOAT,
              'gross_amount', dp.amount::FLOAT, 'unit', dp.unit, 'waste_percentage', dp.waste_percentage,
              'price_per_unit', p.price_per_unit::FLOAT, 'product_unit', p.unit
            )) FILTER (WHERE p.id IS NOT NULL), '[]') as ingredients
          FROM dishes d
          LEFT JOIN dish_products dp ON d.id = dp.dish_id
          LEFT JOIN products p ON dp.product_id = p.id
          WHERE d.id = $1 GROUP BY d.id, d.name`;

                const result = await client.queryObject(queryText, [Number(id)]);
                if (result.rows.length === 0) return new Response(JSON.stringify({ error: "Dish not found" }), { headers: corsHeaders, status: 404 });
                return new Response(JSON.stringify(result.rows[0]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } else {
                const result = await client.queryObject(`
          SELECT d.id, d.name, COUNT(dp.product_id)::INT as products_count, COALESCE(v.live_cost, 0)::FLOAT as total_cost
          FROM dishes d
          LEFT JOIN dish_products dp ON d.id = dp.dish_id
          LEFT JOIN view_dish_live_costs v ON d.id = v.dish_id
          GROUP BY d.id, d.name, v.live_cost ORDER BY d.id DESC`);
                return new Response(JSON.stringify(result.rows), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
        }

        // POST /dishes
        if (req.method === "POST") {
            const { name, products } = await req.json();
            if (!name || !products || !Array.isArray(products) || products.length === 0) {
                return new Response(JSON.stringify({ error: "Invalid payload data" }), { headers: corsHeaders, status: 400 });
            }

            const tx = client.createTransaction("create_dish");
            await tx.begin();

            const dishResult = await tx.queryObject<{ id: number }>(`INSERT INTO dishes (name) VALUES ($1) RETURNING id`, [name.trim()]);
            const newDishId = dishResult.rows[0].id;

            for (const prod of products) {
                let netAmount = parseFloat(prod.amount) || 0;
                let finalUnit = prod.unit;
                const wastePercent = parseFloat(prod.waste_percentage) || 0;

                if ((finalUnit === 'g' || finalUnit === 'ml') && netAmount >= 1000) {
                    netAmount /= 1000;
                    finalUnit = finalUnit === 'g' ? 'kg' : 'l';
                }
                const grossAmount = netAmount * (1 + wastePercent / 100);

                await tx.queryObject(`INSERT INTO dish_products (dish_id, product_id, amount, unit, waste_percentage) VALUES ($1, $2, $3, $4, $5)`,
                    [newDishId, prod.id, grossAmount, finalUnit, wastePercent]);
            }

            await tx.commit();
            return new Response(JSON.stringify({ success: true, dishId: newDishId }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 201 });
        }

        // PUT /dishes/:id
        if (req.method === "PUT" && isResourceId) {
            const { name, products } = await req.json();
            if (!name || !products || !Array.isArray(products) || products.length === 0) {
                return new Response(JSON.stringify({ error: "Invalid payload data" }), { headers: corsHeaders, status: 400 });
            }

            const tx = client.createTransaction("update_dish");
            await tx.begin();

            await tx.queryObject(`UPDATE dishes SET name = $1 WHERE id = $2`, [name.trim(), Number(id)]);
            await tx.queryObject(`DELETE FROM dish_products WHERE dish_id = $1`, [Number(id)]);

            for (const prod of products) {
                let netAmount = parseFloat(prod.amount) || 0;
                let finalUnit = prod.unit;
                const wastePercent = parseFloat(prod.waste_percentage) || 0;

                if ((finalUnit === 'g' || finalUnit === 'ml') && netAmount >= 1000) {
                    netAmount /= 1000;
                    finalUnit = finalUnit === 'g' ? 'kg' : 'l';
                }
                const grossAmount = netAmount * (1 + wastePercent / 100);

                await tx.queryObject(`INSERT INTO dish_products (dish_id, product_id, amount, unit, waste_percentage) VALUES ($1, $2, $3, $4, $5)`,
                    [Number(id), prod.id, grossAmount, finalUnit, wastePercent]);
            }

            await tx.commit();
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // DELETE /dishes/:id
        if (req.method === "DELETE" && isResourceId) {
            await client.queryObject(`DELETE FROM dishes WHERE id = $1`, [Number(id)]);
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), { headers: corsHeaders, status: 405 });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    } finally {
        client.release();
    }
});