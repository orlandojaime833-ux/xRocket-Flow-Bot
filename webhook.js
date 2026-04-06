// ============================================
// xROCKET FLOW - BOT PRINCIPAL
// ============================================

const { Telegraf } = require('telegraf');
const express = require('express');
const { webhookRouter, createInvoice } = require('./webhook');

// ============ CONFIGURAÇÕES ============
const BOT_TOKEN = '8642593414:AAFjKWsd9za1jIeHLpDlVfobyca1SiaAhGM';
const ADMIN_ID = 7991785009;

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

// Registrar o webhook
app.use('/webhook', webhookRouter);

// ============ COMANDO DE COMPRA COM PAGAMENTO REAL ============
bot.command('comprar_produto', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('📝 Uso: /comprar_produto ID_PRODUTO');
    }
    
    const productId = args[1];
    const product = await getProductById(productId);
    
    if (!product) {
        return ctx.reply('❌ Produto não encontrado.');
    }
    
    const externalId = `order_${Date.now()}_${ctx.from.id}`;
    
    const paymentUrl = await createInvoice(
        product.price,
        product.name,
        externalId,
        bot,
        ctx.from.id,
        product.seller_id
    );
    
    if (paymentUrl) {
        await ctx.reply(
            `💳 *PAGAMENTO*\n\n` +
            `Produto: ${product.name}\n` +
            `Valor: $${product.price} USDT\n\n` +
            `🔗 *Link para pagamento:*\n${paymentUrl}\n\n` +
            `⏰ Válido por 1 hora.\n\n` +
            `Após o pagamento, você receberá a confirmação automática.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.reply('❌ Erro ao gerar pagamento. Tente novamente.');
    }
});

// Servidor
const PORT = process.env.PORT || 1000;
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    bot.launch();
    console.log('🤖 Bot iniciado!');
    console.log(`🔗 Webhook disponível em: https://localhost:${PORT}/webhook/xrocket`);
});
