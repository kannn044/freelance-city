import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding items...");

    // ─── Raw materials / Seeds ───────────────────────────
    const chickenSeed = await prisma.item.upsert({
        where: { name: "Chicken Egg" },
        update: { exp_value: 0.5 },
        create: {
            name: "Chicken Egg",
            type: "SEED",
            buy_price: 50,
            max_stack: 10,
            grow_mins: 10,
            exp_value: 0.5,
            icon: "🥚",
        },
    });

    const beefCalf = await prisma.item.upsert({
        where: { name: "Beef Calf" },
        update: { exp_value: 0.8 },
        create: {
            name: "Beef Calf",
            type: "SEED",
            buy_price: 120,
            max_stack: 10,
            grow_mins: 20,
            exp_value: 0.8,
            icon: "🐄",
        },
    });

    const vegSeed = await prisma.item.upsert({
        where: { name: "Vegetable Seed" },
        update: { exp_value: 0.3 },
        create: {
            name: "Vegetable Seed",
            type: "SEED",
            buy_price: 30,
            max_stack: 10,
            grow_mins: 8,
            exp_value: 0.3,
            icon: "🌱",
        },
    });

    // ─── Raw produce ─────────────────────────────────────
    const chickenMeat = await prisma.item.upsert({
        where: { name: "Chicken Meat" },
        update: { exp_value: 1.0 },
        create: {
            name: "Chicken Meat",
            type: "RAW",
            sell_price: 80,
            max_stack: 5,
            exp_value: 1.0,
            icon: "🍗",
        },
    });

    const beefMeat = await prisma.item.upsert({
        where: { name: "Beef Meat" },
        update: { exp_value: 1.5 },
        create: {
            name: "Beef Meat",
            type: "RAW",
            sell_price: 180,
            max_stack: 5,
            exp_value: 1.5,
            icon: "🥩",
        },
    });

    const vegetable = await prisma.item.upsert({
        where: { name: "Vegetable" },
        update: { exp_value: 0.5 },
        create: {
            name: "Vegetable",
            type: "RAW",
            sell_price: 40,
            max_stack: 10,
            exp_value: 0.5,
            icon: "🥬",
        },
    });

    // ─── Ingredients ─────────────────────────────────────
    const salt = await prisma.item.upsert({
        where: { name: "Salt" },
        update: { exp_value: 0.2 },
        create: {
            name: "Salt",
            type: "INGREDIENT",
            buy_price: 20,
            max_stack: 20,
            exp_value: 0.2,
            icon: "🧂",
        },
    });

    // ─── Link seeds to yields ────────────────────────────
    await prisma.item.update({
        where: { id: chickenSeed.id },
        data: { yield_item_id: chickenMeat.id, yield_qty: 1 },
    });
    await prisma.item.update({
        where: { id: beefCalf.id },
        data: { yield_item_id: beefMeat.id, yield_qty: 1 },
    });
    await prisma.item.update({
        where: { id: vegSeed.id },
        data: { yield_item_id: vegetable.id, yield_qty: 2 },
    });

    // ─── Meals ───────────────────────────────────────────
    const chickenSalad = await prisma.item.upsert({
        where: { name: "Chicken Salad" },
        update: { exp_value: 2.0 },
        create: {
            name: "Chicken Salad",
            type: "MEAL",
            sell_price: 150,
            kcal: 80,
            buff_pct: 0.05,
            buff_mins: 30,
            max_stack: 3,
            exp_value: 2.0,
            icon: "🥗",
        },
    });

    const beefSteak = await prisma.item.upsert({
        where: { name: "Beef Steak" },
        update: { exp_value: 3.0 },
        create: {
            name: "Beef Steak",
            type: "MEAL",
            sell_price: 400,
            kcal: 360,
            buff_pct: 0.15,
            buff_mins: 60,
            max_stack: 3,
            exp_value: 3.0,
            icon: "🥩",
        },
    });

    // ─── Recipes ─────────────────────────────────────────
    console.log("🍳 Seeding recipes...");

    // Chicken Salad: 1 Chicken Meat + 2 Vegetable
    const saladRecipe = await prisma.recipe.upsert({
        where: { name: "Chicken Salad" },
        update: { unlock_price: 250 },
        create: {
            name: "Chicken Salad",
            output_item_id: chickenSalad.id,
            output_qty: 1,
            cook_mins: 5,
            unlock_price: 250,
        },
    });

    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: saladRecipe.id, item_id: chickenMeat.id } },
        update: {},
        create: { recipe_id: saladRecipe.id, item_id: chickenMeat.id, quantity: 1 },
    });
    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: saladRecipe.id, item_id: vegetable.id } },
        update: {},
        create: { recipe_id: saladRecipe.id, item_id: vegetable.id, quantity: 2 },
    });

    // Beef Steak: 1 Beef Meat + 1 Vegetable + 1 Salt
    const steakRecipe = await prisma.recipe.upsert({
        where: { name: "Beef Steak" },
        update: { unlock_price: 600 },
        create: {
            name: "Beef Steak",
            output_item_id: beefSteak.id,
            output_qty: 1,
            cook_mins: 10,
            unlock_price: 600,
        },
    });

    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: steakRecipe.id, item_id: beefMeat.id } },
        update: {},
        create: { recipe_id: steakRecipe.id, item_id: beefMeat.id, quantity: 1 },
    });
    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: steakRecipe.id, item_id: vegetable.id } },
        update: {},
        create: { recipe_id: steakRecipe.id, item_id: vegetable.id, quantity: 1 },
    });
    await prisma.recipeIngredient.upsert({
        where: { recipe_id_item_id: { recipe_id: steakRecipe.id, item_id: salt.id } },
        update: {},
        create: { recipe_id: steakRecipe.id, item_id: salt.id, quantity: 1 },
    });

    console.log("✅ Seed complete!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
