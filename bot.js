// xROCKET FLOW - BOT COMPLETO
// Conexões automáticas com todas as plataformas externas

const { Telegraf } = require('telegraf');
const { neon } = require('@neondatabase/serverless');
const express = require('express');
const axios = require('axios');

// ================== CONFIGURAÇÕES DAS PLATAFORMAS ==================
// TUDO dentro do mesmo arquivo - conexões automáticas

// 1. TELEGRAM
const BOT_TOKEN = '8642593414:AAFjKWsd9za1jleHLpDIVfobyc';

// 2. NEON (PostgreSQL)
const DATABASE_URL = 'postgresql://neondb_owner:npg_ZSd53OIxHKLf@ep-small-glade-am3k2zgg-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

// 3. XROCKET (Pagamentos)
const XROCKET_API_KEY = 'c01709a9c058bd25eeefea6b2';
const XROCKET_BASE_URL = 'https://api.xrocket.com.br';

// 4. GEMINI (IA)
const GEMINI_API_KEY = 'AlzaSyBbFcGJYvNN-b-i2tlkiZrY7jZ_pjEij4A';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

// ================== INICIALIZAÇÃO DAS CONEXÕES ==================

// Conexão Neon (automática)
const sql = neon(DATABASE_URL);
console.log('🟢 Neon: Conectado automaticamente');

// Bot Telegram (automático)
const bot = new Telegraf(BOT_TOKEN);
console.log('🟢 Telegram: Bot inicializado');

// Servidor Express (para webhook)
const app = express();
app.use(express.json());

// ================== FUNÇÕES DE API EXTERNAS ==================

// Função automática para Xrocket
async function callXrocket(endpoint, data = {}) {
    try {
        const response = await axios.post(
            `${XROCKET_BASE_URL}/${endpoint}`,
            { ...data, api_key: XROCKET_API_KEY }
        );
        console.log(`🟢 Xrocket: ${endpoint} OK`);
        return response.data;
    } catch (error) {
        console.error(`🔴 Xrocket: ${endpoint} ERRO`, error.message);
        return { error: true, message: error.message };
    }
}

// Função automática para Gemini
async function callGemini(prompt) {
    try {
        const response = await axios.post(
            `${GEMINI_URL}?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );
        console.log('🟢 Gemini: IA respondida');
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('🔴 Gemini: ERRO', error.message);
        return '❌ Erro na IA. Tente novamente.';
    }
}

// ================== CRIAÇÃO DAS TABELAS (AUTOMÁTICA) ==================

async function initDatabase() {
    try {
        await sql`CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            name TEXT,
            plan TEXT DEFAULT 'FREE',
            balance DECIMAL(10,2) DEFAULT 0,
            store_id TEXT,
            referred_by BIGINT,
            affiliate_code TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;
        
        await sql`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT,
            price DECIMAL(10,2),
            description TEXT,
            owner_id BIGINT REFERENCES users(id),
            created_at TIMESTAMP DEFAULT NOW()
        )`;
        
        await sql`CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY,
            seller_id BIGINT REFERENCES users(id),
            product_id TEXT,
            amount DECIMAL(10,2),
            commission DECIMAL(10,2),
            affiliate_id BIGINT,
            affiliate_commission DECIMAL(10,2),
            date TIMESTAMP DEFAULT NOW()
        )`;
        
        await sql`CREATE TABLE IF NOT EXISTS referrals (
            id SERIAL PRIMARY KEY,
            referrer_id BIGINT REFERENCES users(id),
            referred_id BIGINT REFERENCES users(id),
            commission_paid BOOLEAN DEFAULT FALSE,
            commission_value DECIMAL(10,2) DEFAULT 0,
            date TIMESTAMP DEFAULT NOW()
        )`;
        
        await sql`CREATE TABLE IF NOT EXISTS withdrawals (
            id TEXT PRIMARY KEY,
            user_id BIGINT REFERENCES users(id),
            amount DECIMAL(10,2),
            status TEXT DEFAULT 'pending',
            date TIMESTAMP DEFAULT NOW()
        )`;
        
        await sql`CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            user_id BIGINT REFERENCES users(id),
            amount DECIMAL(10,2),
            plan TEXT,
            status TEXT DEFAULT 'pending',
            payment_url TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;
        
        console.log('✅ Todas as tabelas criadas/verificadas');
    } catch (error) {
        console.error('❌ Erro ao criar tabelas:', error);
    }
}

// ================== FUNÇÕES AUXILIARES ==================

function formatMoney(value) {
    return `$${parseFloat(value).toFixed(2)}`;
}

function generateAffiliateCode(userId) {
    return `AF${userId.toString().slice(-6)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// Planos
const PLANS = {
    FREE: { name: 'FREE', price: 0, productsLimit: 5, minWithdraw: 20, commission: 5 },
    BASIC: { name: 'BASIC', price: 9.90, productsLimit: 50, minWithdraw: 5, commission: 5 },
    NORMAL: { name: 'NORMAL', price: 19.90, productsLimit: 500, minWithdraw: 2, commission: 5 },
    ECOMMERCE: { name: 'ECOMMERCE', price: 39.90, productsLimit: 999999, minWithdraw: 0, commission: 5 }
};

// ================== PROCESSAR VENDA (COM COMISSÃO 5%) ==================

async function processSale(sellerId, productId, productPrice, productName) {
    const commission = productPrice * 0.05;
    
    const user = await sql`SELECT * FROM users WHERE id = ${sellerId}`;
    let affiliateId = null;
    let affiliateCommission = 0;
    
    if (user[0]?.referred_by) {
        affiliateId = user[0].referred_by;
        affiliateCommission = productPrice * 0.05;
        await sql`UPDATE users SET balance = balance + ${affiliateCommission} WHERE id = ${affiliateId}`;
        
        const existingReferral = await sql`SELECT * FROM referrals WHERE referred_id = ${sellerId}`;
        if (existingReferral.length === 0) {
            await sql`
                INSERT INTO referrals (referrer_id, referred_id, commission_value, commission_paid)
                VALUES (${affiliateId}, ${sellerId}, ${affiliateCommission}, TRUE)
            `;
        }
        
        await bot.telegram.sendMessage(affiliateId,
            `🎉 *COMISSÃO DE AFILIADO!*\n\n` +
            `💰 Produto: ${productName}\n` +
            `💵 Valor: ${formatMoney(productPrice)}\n` +
            `📈 Sua comissão (5%): ${formatMoney(affiliateCommission)}`,
            { parse_mode: 'Markdown' }
        );
    }
    
    await sql`UPDATE users SET balance = balance + ${commission} WHERE id = ${sellerId}`;
    
    const saleId = Date.now().toString();
    await sql`
        INSERT INTO sales (id, seller_id, product_id, amount, commission, affiliate_id, affiliate_commission)
        VALUES (${saleId}, ${sellerId}, ${productId}, ${productPrice}, ${commission}, ${affiliateId}, ${affiliateCommission})
    `;
    
    return { commission, affiliateCommission, affiliateId };
}

// ================== VERIFICAR SE PODE SACAR ==================

async function canWithdraw(userId) {
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    if (!user[0]) return { can: false, reason: 'Usuário não encontrado' };
    
    const plan = PLANS[user[0].plan];
    if (!plan) return { can: false, reason: 'Plano inválido' };
    
    const balance = parseFloat(user[0].balance);
    if (balance < plan.minWithdraw) {
        return { can: false, reason: `Mínimo para saque no plano ${plan.name} é ${formatMoney(plan.minWithdraw)}` };
    }
    
    return { can: true, balance, plan };
}

// ================== COMANDOS DO BOT ==================

// START
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    
    try {
        const existingUser = await sql`SELECT * FROM users WHERE id = ${userId}`;
        
        if (existingUser.length === 0) {
            const affiliateCode = generateAffiliateCode(userId);
            await sql`
                INSERT INTO users (id, name, plan, balance, referred_by, affiliate_code)
                VALUES (${userId}, ${userName}, 'FREE', 0, ${referrerId || null}, ${affiliateCode})
            `;
            
            if (referrerId && referrerId !== userId) {
                await bot.telegram.sendMessage(referrerId,
                    `🎉 *Nova indicação!*\n\n${userName} entrou usando seu link!\n💰 Você ganha 5% de comissão sobre TODAS as vendas de produtos dele(a).`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
        
        const user = (await sql`SELECT * FROM users WHERE id = ${userId}`)[0];
        const affiliateLink = `https://t.me/${ctx.botInfo.username}?start=${userId}`;
        
        await ctx.reply(
            `🚀 *xROCKET FLOW*\n\n` +
            `Olá ${userName}!\n` +
            `📊 Plano: *${user.plan}*\n` +
            `💰 Saldo: ${formatMoney(user.balance)}\n\n` +
            `🔗 *Seu link de afiliado:*\n${affiliateLink}\n\n` +
            `📌 *COMANDOS:*\n` +
            `/produtos - Gerenciar produtos\n` +
            `/vender - Registrar venda\n` +
            `/afiliado - Ver comissões\n` +
            `/sacar - Sacar saldo\n` +
            `/planos - Ver planos\n` +
            `/assinar - Assinar plano\n` +
            `/saldo - Ver saldo\n` +
            `/ajuda - Ajuda`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error(error);
        ctx.reply('❌ Erro interno. Tente novamente.');
    }
});

// PRODUTOS - Adicionar
bot.command('addproduto', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('❌ Use: /addproduto NOME PRECO\nEx: /addproduto Curso JS 49.90');
    }
    
    const userId = ctx.from.id;
    const name = args.slice(1, -1).join(' ');
    const price = parseFloat(args[args.length - 1]);
    
    if (isNaN(price) || price <= 0) return ctx.reply('❌ Preço inválido');
    
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    const plan = PLANS[user[0].plan];
    
    const productCount = await sql`SELECT COUNT(*) FROM products WHERE owner_id = ${userId}`;
    if (productCount[0].count >= plan.productsLimit) {
        return ctx.reply(`❌ Limite de ${plan.productsLimit} produtos atingido. Assine um plano superior.`);
    }
    
    const productId = Date.now().toString();
    await sql`
        INSERT INTO products (id, name, price, owner_id)
        VALUES (${productId}, ${name}, ${price}, ${userId})
    `;
    
    await ctx.reply(`✅ Produto "${name}" adicionado!\n💰 Preço: ${formatMoney(price)}\n🆔 ID: ${productId}`);
});

// PRODUTOS - Listar
bot.command('produtos', async (ctx) => {
    const userId = ctx.from.id;
    const products = await sql`SELECT * FROM products WHERE owner_id = ${userId}`;
    
    if (products.length === 0) {
        return ctx.reply('📦 Nenhum produto cadastrado.\nUse /addproduto NOME PRECO');
    }
    
    let msg = '📦 *SEUS PRODUTOS:*\n\n';
    products.forEach(p => {
        msg += `🆔 ${p.id}\n📌 ${p.name}\n💰 ${formatMoney(p.price)}\n\n`;
    });
    msg += `Use /vender ID_DO_PRODUTO para registrar venda`;
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// PRODUTOS - Remover
bot.command('delproduto', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('❌ Use: /delproduto ID_DO_PRODUTO');
    
    const productId = args[1];
    const userId = ctx.from.id;
    
    await sql`DELETE FROM products WHERE id = ${productId} AND owner_id = ${userId}`;
    await ctx.reply(`✅ Produto removido com sucesso!`);
});

// VENDER
bot.command('vender', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('❌ Use: /vender ID_DO_PRODUTO');
    
    const productId = args[1];
    const userId = ctx.from.id;
    
    const product = await sql`SELECT * FROM products WHERE id = ${productId} AND owner_id = ${userId}`;
    if (product.length === 0) return ctx.reply('❌ Produto não encontrado');
    
    const { commission, affiliateCommission, affiliateId } = await processSale(
        userId, productId, product[0].price, product[0].name
    );
    
    let msg = `✅ *VENDA REGISTRADA!*\n\n`;
    msg += `📦 Produto: ${product[0].name}\n`;
    msg += `💰 Valor: ${formatMoney(product[0].price)}\n`;
    msg += `📈 Sua comissão (5%): ${formatMoney(commission)}\n`;
    
    if (affiliateId) {
        msg += `👥 Comissão afiliado (5%): ${formatMoney(affiliateCommission)}\n`;
    }
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// AFILIADO
bot.command('afiliado', async (ctx) => {
    const userId = ctx.from.id;
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    const referrals = await sql`SELECT * FROM referrals WHERE referrer_id = ${userId}`;
    const sales = await sql`SELECT * FROM sales WHERE affiliate_id = ${userId}`;
    
    const totalAffiliateCommission = sales.reduce((sum, s) => sum + parseFloat(s.affiliate_commission), 0);
    const affiliateLink = `https://t.me/${ctx.botInfo.username}?start=${userId}`;
    
    let referralsList = '';
    for (const ref of referrals) {
        const referredUser = await sql`SELECT * FROM users WHERE id = ${ref.referred_id}`;
        referralsList += `└ 👤 ${referredUser[0]?.name || ref.referred_id} - Comissão: ${formatMoney(ref.commission_value)}\n`;
    }
    
    await ctx.reply(
        `🤝 *SISTEMA DE AFILIADOS*\n\n` +
        `🔗 *Seu link:*\n${affiliateLink}\n\n` +
        `💰 *Total ganho como afiliado:* ${formatMoney(totalAffiliateCommission)}\n` +
        `👥 *Indicações:* ${referrals.length}\n\n` +
        `📋 *Detalhes das indicações:*\n${referralsList || 'Nenhuma indicação ainda'}\n\n` +
        `✨ *Você ganha 5% de comissão sobre TODAS as vendas de produtos de quem você indicar!*`,
        { parse_mode: 'Markdown' }
    );
});

// SALDO
bot.command('saldo', async (ctx) => {
    const userId = ctx.from.id;
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    
    await ctx.reply(
        `💰 *SEU SALDO*\n\n` +
        `💵 Total disponível: ${formatMoney(user[0].balance)}\n\n` +
        `📌 Para sacar, use /sacar\n` +
        `Plano atual: ${user[0].plan} - Mínimo para saque: ${formatMoney(PLANS[user[0].plan].minWithdraw)}`,
        { parse_mode: 'Markdown' }
    );
});

// SACAR
bot.command('sacar', async (ctx) => {
    const userId = ctx.from.id;
    const { can, reason, balance, plan } = await canWithdraw(userId);
    
    if (!can) return ctx.reply(`❌ ${reason}`);
    
    const withdrawalId = Date.now().toString();
    await sql`
        INSERT INTO withdrawals (id, user_id, amount, status)
        VALUES (${withdrawalId}, ${userId}, ${balance}, 'pending')
    `;
    
    await sql`UPDATE users SET balance = 0 WHERE id = ${userId}`;
    
    await bot.telegram.sendMessage(ADMIN_ID,
        `💰 *SOLICITAÇÃO DE SAQUE*\n\n` +
        `Usuário: ${ctx.from.first_name}\n` +
        `ID: ${userId}\n` +
        `Plano: ${plan.name}\n` +
        `Valor: ${formatMoney(balance)}\n` +
        `ID Saque: ${withdrawalId}`,
        { parse_mode: 'Markdown' }
    );
    
    await ctx.reply(
        `✅ *SAQUE SOLICITADO!*\n\n` +
        `Valor: ${formatMoney(balance)}\n` +
        `Seu saldo foi zerado. O pagamento será processado em até 48h.\n` +
        `ID da transação: ${withdrawalId}`,
        { parse_mode: 'Markdown' }
    );
});

// PLANOS
bot.command('planos', async (ctx) => {
    let msg = '📊 *NOSSOS PLANOS MENSAIS*\n\n';
    
    for (const [key, plan] of Object.entries(PLANS)) {
        msg += `*${plan.name}* - ${plan.price === 0 ? 'Grátis' : formatMoney(plan.price)}/mês\n`;
        msg += `💰 Mínimo para saque: ${plan.minWithdraw === 0 ? 'Sem mínimo' : formatMoney(plan.minWithdraw)}\n`;
        msg += `📦 Limite de produtos: ${plan.productsLimit === 999999 ? 'Ilimitado' : plan.productsLimit}\n`;
        msg += `💵 Comissão por venda: ${plan.commission}%\n`;
        msg += `🤝 Comissão de afiliado: 5%\n\n`;
    }
    
    msg += `📌 Para assinar: /assinar BASIC (ou NORMAL, ECOMMERCE)`;
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ASSINAR
bot.command('assinar', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const planType = args[1]?.toUpperCase();
    
    if (!planType || !PLANS[planType]) {
        return ctx.reply('❌ Use: /assinar BASIC, /assinar NORMAL ou /assinar ECOMMERCE');
    }
    
    const userId = ctx.from.id;
    const plan = PLANS[planType];
    
    if (plan.price === 0) {
        await sql`UPDATE users SET plan = ${planType} WHERE id = ${userId}`;
        return ctx.reply(`✅ Plano ${plan.name} ativado com sucesso!`);
    }
    
    // Criar pagamento via Xrocket
    const paymentId = Date.now().toString();
    const payment = await callXrocket('create_checkout', {
        amount: plan.price,
        description: `Plano ${plan.name} - xROCKET FLOW`,
        user_id: userId,
        payment_id: paymentId
    });
    
    if (payment.error) {
        return ctx.reply('❌ Erro ao gerar pagamento. Tente novamente.');
    }
    
    await sql`
        INSERT INTO payments (id, user_id, amount, plan, payment_url, status)
        VALUES (${paymentId}, ${userId}, ${plan.price}, ${planType}, ${payment.payment_link || '#'}, 'pending')
    `;
    
    await ctx.reply(
        `💳 *ASSINATURA ${plan.name}*\n\n` +
        `💰 Valor: ${formatMoney(plan.price)}/mês\n\n` +
        `🔗 *Link para pagamento:*\n${payment.payment_link}\n\n` +
        `⚠️ Após o pagamento, use /confirmar ${planType} para ativar seu plano.`,
        { parse_mode: 'Markdown' }
    );
});

// CONFIRMAR PAGAMENTO
bot.command('confirmar', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const planType = args[1]?.toUpperCase();
    
    if (!planType || !PLANS[planType]) {
        return ctx.reply('❌ Use: /confirmar BASIC, /confirmar NORMAL ou /confirmar ECOMMERCE');
    }
    
    const userId = ctx.from.id;
    const pendingPayment = await sql`
        SELECT * FROM payments 
        WHERE user_id = ${userId} AND plan = ${planType} AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
    `;
    
    if (pendingPayment.length === 0) {
        return ctx.reply('❌ Nenhum pagamento pendente encontrado para este plano.');
    }
    
    // Verificar pagamento na Xrocket
    const check = await callXrocket('check_payment', { payment_id: pendingPayment[0].id });
    
    if (check.paid) {
        await sql`UPDATE users SET plan = ${planType} WHERE id = ${userId}`;
        await sql`UPDATE payments SET status = 'paid' WHERE id = ${pendingPayment[0].id}`;
        
        // Pagar comissão ao afiliado (se existir)
        const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
        if (user[0].referred_by) {
            const affiliateId = user[0].referred_by;
            const affiliateCommission = plan.price * 0.05;
            await sql`UPDATE users SET balance = balance + ${affiliateCommission} WHERE id = ${affiliateId}`;
            
            await bot.telegram.sendMessage(affiliateId,
                `🎉 *COMISSÃO DE INDICAÇÃO!*\n\n` +
                `Seu indicado assinou o plano ${planType}!\n` +
                `💰 Você ganhou ${formatMoney(affiliateCommission)} (5% do plano)`,
                { parse_mode: 'Markdown' }
            );
        }
        
        await ctx.reply(`✅ *PAGAMENTO CONFIRMADO!*\n\nPlano ${PLANS[planType].name} ativado com sucesso!`, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply('⏳ Pagamento ainda não confirmado. Aguarde alguns minutos e tente novamente.');
    }
});

// AJUDA
bot.command('ajuda', async (ctx) => {
    await ctx.reply(
        `🆘 *AJUDA - xROCKET FLOW*\n\n` +
        `📌 *COMANDOS:*\n` +
        `/start - Iniciar bot\n` +
        `/addproduto NOME PRECO - Adicionar produto\n` +
        `/produtos - Listar produtos\n` +
        `/delproduto ID - Remover produto\n` +
        `/vender ID - Registrar venda\n` +
        `/afiliado - Ver comissões\n` +
        `/sacar - Sacar saldo\n` +
        `/saldo - Ver saldo\n` +
        `/planos - Ver planos\n` +
        `/assinar PLANO - Assinar plano\n` +
        `/confirmar PLANO - Confirmar pagamento\n` +
        `/ajuda - Este menu\n\n` +
        `💡 *COMISSÕES:*\n` +
        `• Você ganha 5% sobre cada produto vendido\n` +
        `• Afiliados ganham 5% sobre vendas dos indicados (lifetime)\n` +
        `• Saques: FREE($20) | BASIC($5) | NORMAL($2) | ECOMMERCE($0)`,
        { parse_mode: 'Markdown' }
    );
});

// ================== SERVIDOR EXPRESS ==================

app.get('/', (req, res) => {
    res.send('✅ xROCKET FLOW Bot está rodando!');
});

app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body);
    res.sendStatus(200);
});

// ================== INICIALIZAÇÃO ==================

async function main() {
    await initDatabase();
    
    // Webhook (descomente se for usar no Render)
    // await bot.telegram.setWebhook(`https://seu-dominio.onrender.com/webhook/${BOT_TOKEN}`);
    
    // Para desenvolvimento local:
    bot.launch();
    console.log('🚀 Bot xROCKET FLOW iniciado!');
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Servidor rodando na porta ${PORT}`);
    });
}

main();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
