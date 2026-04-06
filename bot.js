// ============================================
// xROCKET FLOW - BOT PROFISSIONAL
// Com PostgreSQL (Neon) + Webhook xRocket
// ============================================

const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const express = require('express');
const axios = require('axios');

// ============ CONFIGURAÇÕES ============
const BOT_TOKEN = '8642593414:AAFjKWsd9za1jIeHLpDlVfobyca1SiaAhGM';
const ADMIN_ID = 7991785009;
const XROCKET_API_KEY = 'c01709a9c058bd25eeefea6b2';

// String do Neon que você me enviou
const DATABASE_URL = 'postgresql://orlando_store_owner:npg_7c2M7F2drHfM@ep-tiny-glade-a87c7ok8-pooler.eastus2.azure.neon.tech/orlando_store?sslmode=require';

// ============ CONEXÃO COM BANCO DE DADOS ============
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ============ INICIALIZAÇÃO ============
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

// ============ PEDIDOS PENDENTES (para webhook) ============
let pendingOrders = new Map();

// ============ CRIAÇÃO DAS TABELAS ============
async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS stores (
                id SERIAL PRIMARY KEY,
                seller_id BIGINT UNIQUE NOT NULL,
                seller_name VARCHAR(100),
                store_id VARCHAR(100) UNIQUE NOT NULL,
                plan VARCHAR(20) DEFAULT 'FREE',
                products_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                store_id VARCHAR(100) NOT NULL,
                name VARCHAR(200) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        console.log('✅ Banco de dados conectado');
    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        client.release();
    }
}

// ============ FUNÇÕES DO BANCO ============

async function createStore(sellerId, sellerName) {
    const storeId = `loja_${sellerId}`;
    const client = await pool.connect();
    try {
        await client.query(
            'INSERT INTO stores (seller_id, seller_name, store_id) VALUES ($1, $2, $3)',
            [sellerId, sellerName, storeId]
        );
        return storeId;
    } finally {
        client.release();
    }
}

async function getStore(sellerId) {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM stores WHERE seller_id = $1', [sellerId]);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getStoreByStoreId(storeId) {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM stores WHERE store_id = $1', [storeId]);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function addProduct(storeId, name, price, description = '') {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'INSERT INTO products (store_id, name, price, description) VALUES ($1, $2, $3, $4) RETURNING *',
            [storeId, name, price, description]
        );
        await client.query('UPDATE stores SET products_count = products_count + 1 WHERE store_id = $1', [storeId]);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getProducts(storeId) {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM products WHERE store_id = $1 ORDER BY created_at DESC', [storeId]);
        return result.rows;
    } finally {
        client.release();
    }
}

async function deleteProduct(productId, storeId) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM products WHERE id = $1 AND store_id = $2', [productId, storeId]);
        await client.query('UPDATE stores SET products_count = products_count - 1 WHERE store_id = $1', [storeId]);
        return true;
    } finally {
        client.release();
    }
}

async function getAllProducts() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT p.*, s.seller_name 
            FROM products p 
            JOIN stores s ON p.store_id = s.store_id 
            ORDER BY p.created_at DESC
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getProductById(productId) {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT p.*, s.seller_id, s.seller_name 
            FROM products p 
            JOIN stores s ON p.store_id = s.store_id 
            WHERE p.id = $1
        `, [productId]);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

// ============ FUNÇÃO PARA CRIAR FATURA xROCKET ============
async function createInvoice(amount, productName, externalId, buyerId, sellerId) {
    try {
        const response = await axios.post(
            'https://api.xrocketpay.com/v1/invoice',
            {
                amount: parseFloat(amount),
                currency: 'USDT',
                description: productName,
                external_id: externalId,
                expires_in: 3600
            },
            {
                headers: { 'Authorization': `Bearer ${XROCKET_API_KEY}` }
            }
        );
        
        pendingOrders.set(externalId, {
            buyer_id: buyerId,
            seller_id: sellerId,
            product_name: productName,
            amount: amount,
            status: 'pending',
            createdAt: Date.now()
        });
        
        return response.data.payment_url;
    } catch (error) {
        console.error('❌ Erro ao criar fatura:', error.response?.data || error.message);
        return null;
    }
}

// ============ WEBHOOK DO xROCKET ============
app.post('/webhook/xrocket', async (req, res) => {
    const { status, external_id, amount } = req.body;
    
    console.log(`📥 Webhook: ${status} - ${external_id}`);
    
    if (status === 'paid') {
        const order = pendingOrders.get(external_id);
        
        if (order) {
            order.status = 'paid';
            pendingOrders.set(external_id, order);
            
            await bot.telegram.sendMessage(order.buyer_id,
                `✅ *PAGAMENTO CONFIRMADO!*\n\n` +
                `Produto: ${order.product_name}\n` +
                `Valor: $${amount} USDT\n\n` +
                `📦 Obrigado pela compra!`,
                { parse_mode: 'Markdown' }
            );
            
            if (order.seller_id) {
                await bot.telegram.sendMessage(order.seller_id,
                    `💰 *VENDA REALIZADA!*\n\n` +
                    `Produto: ${order.product_name}\n` +
                    `Valor: $${amount} USDT`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    }
    
    res.json({ ok: true });
});

// ============ COMANDOS DO BOT ============

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const store = await getStore(userId);
    
    if (store) {
        await ctx.reply(
            `🏪 *Bem-vindo à sua loja!*\n\n` +
            `📦 Produtos: ${store.products_count}\n` +
            `📊 Plano: ${store.plan}\n` +
            `🔗 Link: t.me/xRocketFlow_Bot?start=${store.store_id}\n\n` +
            `📌 Comandos:\n` +
            `/produtos - Listar produtos\n` +
            `/add_produto - Adicionar produto\n` +
            `/remover_produto - Remover produto`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.reply(
            `🚀 *xROCKET FLOW*\n\n` +
            `Crie sua loja e comece a vender!\n\n` +
            `/criar_loja - Criar sua loja\n` +
            `/comprar - Ver produtos à venda\n\n` +
            `🎁 Primeiro mês GRÁTIS!`,
            { parse_mode: 'Markdown' }
        );
    }
});

bot.command('criar_loja', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    const existing = await getStore(userId);
    if (existing) {
        return ctx.reply('❌ Você já tem uma loja! Use /produtos');
    }
    
    await createStore(userId, userName);
    
    await ctx.reply(
        `✅ *LOJA CRIADA!*\n\n` +
        `🔗 Link: t.me/xRocketFlow_Bot?start=loja_${userId}\n\n` +
        `📝 Adicione produtos: /add_produto NOME PRECO\n\n` +
        `🎁 Primeiro mês GRÁTIS!`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('add_produto', async (ctx) => {
    const userId = ctx.from.id;
    const store = await getStore(userId);
    
    if (!store) {
        return ctx.reply('❌ Crie uma loja primeiro: /criar_loja');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
        return ctx.reply('📝 Uso: /add_produto NOME PRECO\nEx: /add_produto "Curso JS" 49.90');
    }
    
    const name = args[0];
    const price = parseFloat(args[1]);
    
    if (isNaN(price)) {
        return ctx.reply('❌ Preço inválido! Use número. Ex: 49.90');
    }
    
    await addProduct(store.store_id, name, price);
    await ctx.reply(`✅ Produto "${name}" adicionado por $${price} USDT!`);
});

bot.command('produtos', async (ctx) => {
    const userId = ctx.from.id;
    const store = await getStore(userId);
    
    if (!store) {
        return ctx.reply('❌ Você não tem uma loja.');
    }
    
    const products = await getProducts(store.store_id);
    
    if (products.length === 0) {
        return ctx.reply('📦 Nenhum produto. Use /add_produto');
    }
    
    let msg = '*📦 SEUS PRODUTOS:*\n\n';
    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        msg += `${i+1}. ${p.name} - $${p.price}\n`;
    }
    msg += `\n🗑️ Remover: /remover_produto NUMERO`;
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('remover_produto', async (ctx) => {
    const userId = ctx.from.id;
    const store = await getStore(userId);
    
    if (!store) {
        return ctx.reply('❌ Você não tem uma loja.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('📝 Uso: /remover_produto NUMERO\nEx: /remover_produto 1');
    }
    
    const index = parseInt(args[1]) - 1;
    const products = await getProducts(store.store_id);
    
    if (index < 0 || index >= products.length) {
        return ctx.reply('❌ Produto não encontrado.');
    }
    
    const product = products[index];
    await deleteProduct(product.id, store.store_id);
    await ctx.reply(`✅ Produto "${product.name}" removido!`);
});

bot.command('comprar', async (ctx) => {
    const allProducts = await getAllProducts();
    
    if (allProducts.length === 0) {
        return ctx.reply('📦 Nenhum produto disponível.');
    }
    
    let msg = '*🛍️ PRODUTOS À VENDA:*\n\n';
    for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];
        msg += `${i+1}. ${p.name} - $${p.price} (${p.seller_name})\n`;
    }
    msg += `\n💰 Para comprar: /comprar_produto ID`;
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('comprar_produto', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('📝 Uso: /comprar_produto ID\nEx: /comprar_produto 1');
    }
    
    const productId = parseInt(args[1]);
    const product = await getProductById(productId);
    
    if (!product) {
        return ctx.reply('❌ Produto não encontrado.');
    }
    
    const externalId = `order_${Date.now()}_${ctx.from.id}`;
    
    const paymentUrl = await createInvoice(
        product.price,
        product.name,
        externalId,
        ctx.from.id,
        product.seller_id
    );
    
    if (paymentUrl) {
        await ctx.reply(
            `💳 *PAGAMENTO*\n\n` +
            `Produto: ${product.name}\n` +
            `Valor: $${product.price} USDT\n\n` +
            `🔗 ${paymentUrl}\n\n` +
            `⏰ Válido por 1 hora.\n\n` +
            `Após o pagamento, você receberá a confirmação.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.reply('❌ Erro ao gerar pagamento. Tente novamente.');
    }
});

// ============ ADMIN: Ver todas as lojas ============
bot.command('admin_lojas', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM stores ORDER BY created_at DESC');
        let msg = '*🏪 TODAS AS LOJAS:*\n\n';
        for (const store of result.rows) {
            msg += `📛 ${store.seller_name}\n`;
            msg += `🔗 ${store.store_id}\n`;
            msg += `📦 ${store.products_count} produtos\n`;
            msg += `📊 ${store.plan}\n━━━━━━━━━━\n`;
        }
        await ctx.reply(msg, { parse_mode: 'Markdown' });
    } finally {
        client.release();
    }
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 1000;

async function start() {
    await initDatabase();
    
    app.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔗 Webhook: https://localhost:${PORT}/webhook/xrocket`);
    });
    
    bot.launch();
    console.log('🤖 Bot iniciado!');
}

start();
