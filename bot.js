// ============================================
// xROCKET FLOW 2030 - BOT PROFISSIONAL
// Com SUAS variáveis
// ============================================

const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// ============ SUAS VARIÁVEIS ============
const BOT_TOKEN = '8642593414:AAFjKWsd9za1jIeHLpDlVfobyca1SiaAhGM';
const ADMIN_ID = 7991785009;
const XROCKET_API = 'c01709a9c058bd25eeefea6b2';
const GEMINI_API_KEY = 'AIzaSyBbFcGJYvNN-b-i2tlkiZrY7jZ_pjEij4A';

// ============ INICIALIZAÇÃO ============
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

// ============ BANCO DE DADOS EM MEMÓRIA ============
let stores = new Map();
let users = new Map();
let products = new Map();
let sales = new Map();

// ============ CONFIGURAÇÃO DOS PLANOS ============
const PLANS = {
    FREE: { name: 'FREE', price: 0, commission: 10, productsLimit: 10, features: ['IA descrições', 'Mini App', '1 template'] },
    PRO: { name: 'PRO', price: 5, commission: 10, productsLimit: 100, features: ['IA descrições', 'IA Vendedora', 'Mini App', '10 templates', 'Cores personalizadas', 'Upload logo'] },
    VIP: { name: 'VIP', price: 10, commission: 10, productsLimit: Infinity, features: ['IA descrições', 'IA Vendedora', 'IA Predictor', 'Mini App', '10 templates', 'Cores personalizadas', 'Upload logo/banner', 'Remoção marca', 'Webhook'] }
};

// ============ PROMPTS IA GEMINI ============

const IA_VENDAS_PROMPT = `
Você é a GEMINI IA, AGENTE DE VENDAS MÁXIMO.

SUA ÚNICA MISSÃO: VENDER OS PRODUTOS DISPONÍVEIS NA LOJA.
- Não sugira novos produtos
- Use persuasão, urgência, escassez
- Ofereça descontos de até 20% se necessário
- Seja entusiasmado e confiante

Cliente: "{{mensagem}}"
Produto: "{{produto}}"
Preço: ${{preco}}

Responda como vendedor profissional:
`;

const IA_SUPORTE_PROMPT = `
Você é o assistente oficial da xROCKET FLOW.

VOCÊ SABE SOBRE:
- Planos: FREE (10 produtos), PRO ($5/mês, 100 produtos), VIP ($10/mês, ilimitado)
- Pagamentos via xRocket (USDT, BTC, ETH)
- Como criar produtos no Mini App

Seja educado e útil. Use emojis. Se não souber, diga: "Vou chamar um administrador".

Pergunta do usuário: "{{pergunta}}"

Responda:
`;

// ============ FUNÇÕES IA ============

async function callGemini(prompt, context) {
    if (!GEMINI_API_KEY) return null;
    
    try {
        const response = await axios.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
            {
                contents: [{
                    parts: [{ text: prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || '') }]
                }],
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 500,
                    topP: 0.95
                }
            },
            {
                params: { key: GEMINI_API_KEY },
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );
        
        return response.data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        console.error('❌ Erro na IA:', error.message);
        return null;
    }
}

async function iaVender(produto, clienteMensagem, preco) {
    return await callGemini(IA_VENDAS_PROMPT, {
        mensagem: clienteMensagem,
        produto: produto.name,
        preco: preco
    });
}

async function iaSuporte(pergunta) {
    return await callGemini(IA_SUPORTE_PROMPT, { pergunta });
}

// ============ FUNÇÕES DE LOJA ============

function getStorePlan(sellerId) {
    const store = stores.get(sellerId);
    if (!store) return PLANS.FREE;
    
    // Primeiro mês grátis
    if (store.firstMonthFree && (Date.now() - store.createdAt < 30 * 24 * 60 * 60 * 1000)) {
        return { ...PLANS.VIP, price: 0, commission: 0 };
    }
    
    return PLANS[store.plan];
}

function canAddProduct(sellerId) {
    const store = stores.get(sellerId);
    const plan = getStorePlan(sellerId);
    return store.productsCount < plan.productsLimit;
}

// ============ COMANDOS DO BOT PRINCIPAL ============

// Menu principal
const mainMenu = Markup.inlineKeyboard([
    [Markup.button.callback('🛍️ CATÁLOGO', 'catalogo')],
    [Markup.button.callback('🛒 CARRINHO', 'carrinho')],
    [Markup.button.callback('🎫 CUPONS', 'cupons')],
    [Markup.button.callback('🏪 MINHA LOJA', 'minha_loja')],
    [Markup.button.callback('❓ AJUDA', 'ajuda')]
]);

// Comando /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    // Registrar usuário
    if (!users.has(userId)) {
        users.set(userId, { id: userId, name: userName, cart: [], createdAt: Date.now() });
    }
    
    // Verificar se é lojista
    const isSeller = stores.has(userId);
    
    if (isSeller) {
        const store = stores.get(userId);
        const plan = getStorePlan(userId);
        await ctx.reply(
            `🏪 *Bem-vindo de volta, ${userName}!*\n\n` +
            `📊 *Sua Loja:* ${store.storeId}\n` +
            `📦 *Plano:* ${plan.name} - $${plan.price}/mês\n` +
            `💰 *Comissão:* ${plan.commission}%\n` +
            `📦 *Produtos:* ${store.productsCount}/${plan.productsLimit === Infinity ? '∞' : plan.productsLimit}\n` +
            `🎨 *Template:* ${store.template}\n\n` +
            `Use os botões abaixo para gerenciar sua loja:`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    } else {
        await ctx.reply(
            `🚀 *Bem-vindo ao xROCKET FLOW, ${userName}!*\n\n` +
            `A plataforma de vendas mais avançada do Telegram.\n\n` +
            `✨ *Recursos:*\n` +
            `• 🤖 IA Gemini para vendas\n` +
            `• 💳 Pagamentos via xRocket\n` +
            `• 🎨 Templates personalizáveis\n` +
            `• 📦 Catálogo, carrinho, cupons\n\n` +
            `💎 *Planos:*\n` +
            `• FREE: $0/mês - 10 produtos\n` +
            `• PRO: $5/mês - 100 produtos\n` +
            `• VIP: $10/mês - Produtos ilimitados\n\n` +
            `🎁 *Primeiro mês GRÁTIS* com todos os recursos!\n\n` +
            `Digite /criar_loja para começar a vender!`,
            { parse_mode: 'Markdown' }
        );
    }
});

// Criar loja
bot.command('criar_loja', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    if (stores.has(userId)) {
        return ctx.reply('🏪 *Você já possui uma loja!* Use /minha_loja para gerenciar.', { parse_mode: 'Markdown' });
    }
    
    const storeId = `loja_${userId}`;
    stores.set(userId, {
        storeId: storeId,
        sellerId: userId,
        sellerName: userName,
        plan: 'FREE',
        productsCount: 0,
        template: 'moderno',
        primaryColor: '#f97316',
        bgColor: '#ffffff',
        textColor: '#000000',
        categories: ['Geral'],
        createdAt: Date.now(),
        firstMonthFree: true
    });
    
    // Criar produtos vazio
    products.set(storeId, []);
    
    await ctx.reply(
        `✅ *LOJA CRIADA COM SUCESSO!*\n\n` +
        `🏪 *Sua loja:* ${storeId}\n` +
        `🔗 *Link:* t.me/xRocketFlow_Bot?start=${storeId}\n\n` +
        `🎁 *Primeiro mês GRÁTIS* com todos os recursos VIP!\n` +
        `💰 *Comissão:* 0% no primeiro mês\n\n` +
        `📝 *Próximos passos:*\n` +
        `1. Use /produtos para gerenciar\n` +
        `2. Use /template para personalizar\n` +
        `3. Compartilhe o link da sua loja!\n\n` +
        `🚀 Comece a vender agora!`,
        { parse_mode: 'Markdown' }
    );
});

// Ver minha loja
bot.command('minha_loja', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!stores.has(userId)) {
        return ctx.reply('❌ *Você não possui uma loja.* Use /criar_loja para começar.', { parse_mode: 'Markdown' });
    }
    
    const store = stores.get(userId);
    const plan = getStorePlan(userId);
    const storeProducts = products.get(store.storeId) || [];
    
    const isFirstMonth = store.firstMonthFree && (Date.now() - store.createdAt < 30 * 24 * 60 * 60 * 1000);
    
    await ctx.reply(
        `🏪 *DADOS DA SUA LOJA*\n\n` +
        `📛 *ID:* ${store.storeId}\n` +
        `🎨 *Template:* ${store.template}\n` +
        `🎨 *Cor principal:* ${store.primaryColor}\n\n` +
        `📊 *PLANO ATUAL*\n` +
        `• Nome: ${plan.name}\n` +
        `• Mensalidade: $${plan.price}\n` +
        `• Comissão: ${plan.commission}%\n` +
        `• Produtos: ${store.productsCount}/${plan.productsLimit === Infinity ? '∞' : plan.productsLimit}\n\n` +
        (isFirstMonth ? `🎁 *PRIMEIRO MÊS GRÁTIS ATIVO!*\nComissão 0% até ${new Date(store.createdAt + 30*24*60*60*1000).toLocaleDateString()}\n\n` : '') +
        `🔗 *Link da loja:*\n` +
        `t.me/xRocketFlow_Bot?start=${store.storeId}\n\n` +
        `📝 *Comandos:*\n` +
        `/produtos - Gerenciar produtos\n` +
        `/template - Personalizar visual\n` +
        `/upgrade - Melhorar plano\n` +
        `/vendas - Ver histórico`,
        { parse_mode: 'Markdown' }
    );
});

// Gerenciar produtos
bot.command('produtos', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!stores.has(userId)) {
        return ctx.reply('❌ *Você não possui uma loja.* Use /criar_loja.', { parse_mode: 'Markdown' });
    }
    
    const store = stores.get(userId);
    const storeProducts = products.get(store.storeId) || [];
    const plan = getStorePlan(userId);
    
    if (storeProducts.length === 0) {
        const addButton = Markup.inlineKeyboard([
            [Markup.button.callback('➕ ADICIONAR PRODUTO', 'add_produto')],
            [Markup.button.callback('🔙 VOLTAR', 'voltar')]
        ]);
        
        return ctx.reply(
            `📦 *NENHUM PRODUTO CADASTRADO*\n\n` +
            `Limite: ${store.productsCount}/${plan.productsLimit === Infinity ? '∞' : plan.productsLimit}\n\n` +
            `Clique no botão abaixo para adicionar seu primeiro produto!`,
            { parse_mode: 'Markdown', ...addButton }
        );
    }
    
    let msg = `📦 *SEUS PRODUTOS* (${storeProducts.length}/${plan.productsLimit === Infinity ? '∞' : plan.productsLimit})\n\n`;
    const buttons = [];
    
    for (let i = 0; i < storeProducts.length; i++) {
        const p = storeProducts[i];
        msg += `${i+1}. *${p.name}* - $${p.price}\n`;
        msg += `   📝 ${p.description?.substring(0, 50)}...\n`;
        msg += `   🏷️ ${p.category}\n\n`;
        buttons.push([Markup.button.callback(`✏️ ${p.name}`, `edit_${i}`)]);
    }
    
    buttons.push([Markup.button.callback('➕ ADICIONAR', 'add_produto')]);
    buttons.push([Markup.button.callback('🔙 VOLTAR', 'voltar')]);
    
    await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
});

// Adicionar produto com IA
bot.action('add_produto', async (ctx) => {
    const userId = ctx.from.id;
    const store = stores.get(userId);
    const plan = getStorePlan(userId);
    
    if (!canAddProduct(userId)) {
        return ctx.reply(
            `❌ *Limite de produtos atingido!*\n\n` +
            `Seu plano ${plan.name} permite apenas ${plan.productsLimit} produtos.\n\n` +
            `Faça upgrade para adicionar mais produtos:\n` +
            `• PRO: $5/mês - 100 produtos\n` +
            `• VIP: $10/mês - Produtos ilimitados\n\n` +
            `Use /upgrade para mais informações.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    ctx.session = { step: 'awaiting_product_name' };
    await ctx.reply(
        `🤖 *CRIAR PRODUTO COM IA*\n\n` +
        `Envie o *NOME* do produto e a IA criará a descrição automaticamente.\n\n` +
        `Exemplo: "Curso JavaScript Avançado"\n\n` +
        `Ou envie no formato manual:\n` +
        `Nome\nPreço\nDescrição\n\n` +
        `Digite /cancelar para cancelar.`,
        { parse_mode: 'Markdown' }
    );
});

// Processar criação de produto
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!stores.has(userId)) return;
    
    // Produto com IA
    if (ctx.session?.step === 'awaiting_product_name') {
        const nome = ctx.message.text.trim();
        
        if (nome === '/cancelar') {
            ctx.session = {};
            return ctx.reply('❌ Criação de produto cancelada.');
        }
        
        await ctx.reply(`🤖 *Gerando descrição para "${nome}"...*`, { parse_mode: 'Markdown' });
        
        // Gerar descrição com IA
        const descricaoIA = await callGemini(
            `Crie uma descrição atraente e persuasiva para o produto: "${nome}". Use emojis, destaque 3 benefícios. Máximo 200 caracteres.`,
            {}
        );
        
        ctx.session = { step: 'awaiting_product_price', productName: nome, productDesc: descricaoIA };
        
        await ctx.reply(
            `✅ *Produto criado!*\n\n` +
            `📦 *Nome:* ${nome}\n` +
            `📝 *Descrição:* ${descricaoIA || 'Produto de alta qualidade'}\n\n` +
            `💰 *Agora envie o PREÇO em USDT:*\n` +
            `Exemplo: 49.90`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Preço do produto
    if (ctx.session?.step === 'awaiting_product_price') {
        const preco = parseFloat(ctx.message.text);
        
        if (isNaN(preco)) {
            return ctx.reply('❌ *Preço inválido!* Envie um número (ex: 49.90)', { parse_mode: 'Markdown' });
        }
        
        const store = stores.get(userId);
        const storeProducts = products.get(store.storeId) || [];
        
        const newProduct = {
            id: Date.now().toString(),
            name: ctx.session.productName,
            price: preco,
            description: ctx.session.productDesc || 'Produto de alta qualidade',
            category: 'Geral',
            active: true,
            createdAt: Date.now()
        };
        
        storeProducts.push(newProduct);
        products.set(store.storeId, storeProducts);
        store.productsCount = storeProducts.length;
        stores.set(userId, store);
        
        ctx.session = {};
        
        await ctx.reply(
            `✅ *PRODUTO ADICIONADO COM SUCESSO!*\n\n` +
            `📦 *Nome:* ${newProduct.name}\n` +
            `💰 *Preço:* $${preco} USDT\n` +
            `📝 *Descrição:* ${newProduct.description}\n\n` +
            `Use /produtos para gerenciar seus produtos.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
});

// Template personalização
bot.command('template', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!stores.has(userId)) {
        return ctx.reply('❌ *Você não possui uma loja.* Use /criar_loja.', { parse_mode: 'Markdown' });
    }
    
    const store = stores.get(userId);
    const plan = getStorePlan(userId);
    
    const templates = Markup.inlineKeyboard([
        [Markup.button.callback('🎨 MODERNO', 'template_moderno')],
        [Markup.button.callback('📱 CLÁSSICO', 'template_classico')],
        [Markup.button.callback('🌙 DARK MODE', 'template_dark')],
        [Markup.button.callback('🌿 NATUREZA', 'template_natureza')],
        [Markup.button.callback('👑 LUXO', 'template_luxo')],
        [Markup.button.callback('🎨 CORES', 'cores')],
        [Markup.button.callback('🔙 VOLTAR', 'voltar')]
    ]);
    
    await ctx.reply(
        `🎨 *PERSONALIZAR SUA LOJA*\n\n` +
        `Template atual: *${store.template}*\n` +
        `Cor principal: ${store.primaryColor}\n\n` +
        `Planos PRO e VIP têm acesso a todos os templates e cores personalizadas.\n` +
        `Seu plano atual: *${plan.name}*\n\n` +
        `Escolha uma opção:`,
        { parse_mode: 'Markdown', ...templates }
    );
});

// Trocar template
bot.action(/template_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const template = ctx.match[1];
    const store = stores.get(userId);
    const plan = getStorePlan(userId);
    
    const allowedTemplates = plan.name === 'FREE' ? ['moderno'] : ['moderno', 'classico', 'dark', 'natureza', 'luxo'];
    
    if (!allowedTemplates.includes(template)) {
        return ctx.reply(
            `❌ *Template não disponível no seu plano!*\n\n` +
            `Faça upgrade para PRO ($${PLANS.PRO.price}/mês) e tenha acesso a todos os templates.\n` +
            `Use /upgrade para mais informações.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    store.template = template;
    stores.set(userId, store);
    
    await ctx.reply(
        `✅ *Template alterado para ${template.toUpperCase()}!*\n\n` +
        `Seu Mini App agora está com o novo visual.\n` +
        `🔗 t.me/xRocketFlow_Bot?start=${store.storeId}`,
        { parse_mode: 'Markdown' }
    );
});

// Personalizar cores
bot.action('cores', async (ctx) => {
    const userId = ctx.from.id;
    const plan = getStorePlan(userId);
    
    if (plan.name === 'FREE') {
        return ctx.reply(
            `❌ *Personalização de cores disponível apenas nos planos PRO e VIP!*\n\n` +
            `PRO: $5/mês - 100 produtos + cores personalizadas\n` +
            `VIP: $10/mês - Produtos ilimitados + todas as funcionalidades\n\n` +
            `Use /upgrade para mais informações.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    ctx.session = { step: 'awaiting_color' };
    await ctx.reply(
        `🎨 *ESCOLHA SUA COR PRINCIPAL*\n\n` +
        `Envie um código de cor HEX:\n` +
        `• #ff0000 - Vermelho\n` +
        `• #00ff00 - Verde\n` +
        `• #0000ff - Azul\n` +
        `• #f97316 - Laranja (padrão)\n` +
        `• #800080 - Roxo\n` +
        `• #ff69b4 - Rosa\n\n` +
        `Exemplo: #ff0000\n\n` +
        `Digite /cancelar para cancelar.`,
        { parse_mode: 'Markdown' }
    );
});

// Processar cor
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    
    if (ctx.session?.step === 'awaiting_color') {
        const color = ctx.message.text.trim();
        
        if (color === '/cancelar') {
            ctx.session = {};
            return ctx.reply('❌ Personalização de cor cancelada.');
        }
        
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (!hexRegex.test(color)) {
            return ctx.reply('❌ *Cor inválida!* Use formato HEX (ex: #ff0000)', { parse_mode: 'Markdown' });
        }
        
        const store = stores.get(userId);
        store.primaryColor = color;
        stores.set(userId, store);
        ctx.session = {};
        
        await ctx.reply(
            `✅ *Cor alterada para ${color}!*\n\n` +
            `Seu Mini App agora está com a nova cor.\n` +
            `🔗 t.me/xRocketFlow_Bot?start=${store.storeId}`,
            { parse_mode: 'Markdown' }
        );
    }
});

// Upgrade de plano
bot.command('upgrade', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!stores.has(userId)) {
        return ctx.reply('❌ *Crie uma loja primeiro.* Use /criar_loja.', { parse_mode: 'Markdown' });
    }
    
    const store = stores.get(userId);
    const currentPlan = getStorePlan(userId);
    
    const plansMenu = Markup.inlineKeyboard([
        [Markup.button.callback('⭐ PRO - $5/mês (100 produtos)', 'upgrade_pro')],
        [Markup.button.callback('💎 VIP - $10/mês (Ilimitado)', 'upgrade_vip')],
        [Markup.button.callback('🔙 VOLTAR', 'voltar')]
    ]);
    
    await ctx.reply(
        `💎 *FAÇA UPGRADE DO SEU PLANO*\n\n` +
        `Plano atual: *${currentPlan.name}*\n\n` +
        `📊 *PRO - $5/mês*\n` +
        `• 100 produtos\n` +
        `• IA Vendedora\n` +
        `• 10 templates\n` +
        `• Cores personalizadas\n` +
        `• Upload de logo\n\n` +
        `👑 *VIP - $10/mês*\n` +
        `• Produtos ILIMITADOS\n` +
        `• IA Predictor\n` +
        `• Remoção da marca xRocket\n` +
        `• Webhook\n` +
        `• Todos os recursos\n\n` +
        `💰 *Comissão:* ${currentPlan.commission}% em todas as vendas\n\n` +
        `Escolha seu plano:`,
        { parse_mode: 'Markdown', ...plansMenu }
    );
});

// Processar upgrade
bot.action(/upgrade_(pro|vip)/, async (ctx) => {
    const userId = ctx.from.id;
    const plan = ctx.match[1].toUpperCase();
    const store = stores.get(userId);
    const planConfig = PLANS[plan];
    
    // Gerar pagamento xRocket
    const orderId = `upgrade_${userId}_${Date.now()}`;
    
    try {
        const payment = await axios.post(
            'https://api.xrocketpay.com/v1/invoice',
            {
                amount: planConfig.price,
                currency: 'USDT',
                description: `Upgrade para plano ${plan} - xROCKET FLOW`,
                external_id: orderId,
                expires_in: 3600
            },
            { headers: { 'Authorization': `Bearer ${XROCKET_API}` } }
        );
        
        // Salvar pedido pendente
        ctx.session = { step: 'awaiting_payment', plan: plan, orderId: orderId };
        
        await ctx.reply(
            `💳 *PAGAMENTO PARA UPGRADE*\n\n` +
            `Plano: ${planConfig.name}\n` +
            `Valor: $${planConfig.price} USDT\n\n` +
            `🔗 *Link para pagamento:*\n${payment.data.payment_url}\n\n` +
            `⏰ Válido por 1 hora.\n\n` +
            `Após o pagamento, seu plano será atualizado automaticamente!\n\n` +
            `Digite /confirmar_pagamento ${orderId} após pagar.`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        await ctx.reply('❌ *Erro ao gerar pagamento.* Tente novamente.', { parse_mode: 'Markdown' });
    }
});

// Confirmar pagamento
bot.command('confirmar_pagamento', async (ctx) => {
    const userId = ctx.from.id;
    const orderId = ctx.message.text.split(' ')[1];
    
    if (!orderId) {
        return ctx.reply('❌ *Use:* /confirmar_pagamento ID_DO_PEDIDO', { parse_mode: 'Markdown' });
    }
    
    // Verificar pagamento no xRocket
    try {
        const invoice = await axios.get(`https://api.xrocketpay.com/v1/invoice/${orderId}`, {
            headers: { 'Authorization': `Bearer ${XROCKET_API}` }
        });
        
        if (invoice.data.status === 'paid') {
            const store = stores.get(userId);
            const plan = ctx.session?.plan || 'PRO';
            store.plan = plan;
            stores.set(userId, store);
            
            await ctx.reply(
                `✅ *UPGRADE REALIZADO COM SUCESSO!*\n\n` +
                `Seu plano agora é *${PLANS[plan].name}*\n\n` +
                `• Produtos: ${PLANS[plan].productsLimit === Infinity ? 'Ilimitados' : PLANS[plan].productsLimit}\n` +
                `• Comissão: ${PLANS[plan].commission}%\n\n` +
                `Use /minha_loja para ver os novos benefícios.`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply('❌ *Pagamento não confirmado.* Aguarde ou verifique no xRocket.', { parse_mode: 'Markdown' });
        }
    } catch (error) {
        await ctx.reply('❌ *Erro ao verificar pagamento.* Tente novamente.', { parse_mode: 'Markdown' });
    }
});

// Catálogo (para clientes comprando)
bot.action('catalogo', async (ctx) => {
    const userId = ctx.from.id;
    const storeProducts = products.get(`loja_${userId}`) || [];
    
    if (storeProducts.length === 0) {
        return ctx.reply('📦 *Nenhum produto disponível no momento.*', { parse_mode: 'Markdown' });
    }
    
    let msg = '*🛍️ CATÁLOGO DE PRODUTOS:*\n\n';
    const btns = [];
    
    for (let i = 0; i < storeProducts.length; i++) {
        const p = storeProducts[i];
        msg += `*${p.name}*\n`;
        msg += `💰 *$${p.price} USDT*\n`;
        msg += `📝 ${p.description || 'Sem descrição'}\n`;
        msg += `━━━━━━━━━━━━━━━━\n\n`;
        btns.push([Markup.button.callback(`➕ ${p.name}`, `add_${p.id}`)]);
    }
    
    btns.push([Markup.button.callback('🔙 Voltar', 'voltar')]);
    
    await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
});

// Ajuda
bot.action('ajuda', async (ctx) => {
    await ctx.reply(
        `❓ *CENTRAL DE AJUDA*\n\n` +
        `📚 *Comandos principais:*\n` +
        `/start - Menu principal\n` +
        `/criar_loja - Criar sua loja\n` +
        `/minha_loja - Ver dados da loja\n` +
        `/produtos - Gerenciar produtos\n` +
        `/template - Personalizar visual\n` +
        `/upgrade - Melhorar plano\n` +
        `/vendas - Ver histórico\n\n` +
        `💬 *Dúvidas?*\n` +
        `• Comunidade: t.me/xRocketFlow_Comunidade\n` +
        `• Chatbot: digite sua pergunta aqui\n` +
        `• Administradores: disponíveis no grupo\n\n` +
        `📖 *Tutoriais:*\n` +
        `• /como_criar_produto\n` +
        `• /como_personalizar\n` +
        `• /como_vender`,
        { parse_mode: 'Markdown' }
    );
});

// Voltar
bot.action('voltar', async (ctx) => {
    const userId = ctx.from.id;
    const isSeller = stores.has(userId);
    
    if (isSeller) {
        const store = stores.get(userId);
        const plan = getStorePlan(userId);
        await ctx.reply(
            `🏪 *MENU PRINCIPAL*\n\n` +
            `Loja: ${store.storeId}\n` +
            `Plano: ${plan.name}\n\n` +
            `O que deseja fazer?`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    } else {
        await ctx.reply(
            `🚀 *MENU PRINCIPAL*\n\n` +
            `Digite /criar_loja para começar a vender!`,
            { parse_mode: 'Markdown' }
        );
    }
});

// ============ WEBHOOK PARA PAGAMENTOS ============
app.post('/webhook/xrocket', async (req, res) => {
    const { status, external_id, amount } = req.body;
    
    if (status === 'paid') {
        const userId = parseInt(external_id.split('_')[1]);
        
        if (external_id.startsWith('upgrade_')) {
            // Upgrade de plano já tratado no confirmar_pagamento
            console.log(`✅ Upgrade pago: ${external_id}`);
        } else {
            // Venda de produto
            const sale = sales.get(external_id);
            if (sale) {
                sale.status = 'paid';
                sales.set(external_id, sale);
                
                // Notificar lojista
                await bot.telegram.sendMessage(sale.storeId.split('_')[1],
                    `💰 *VENDA CONFIRMADA!*\n\n` +
                    `Produto: ${sale.productName}\n` +
                    `Valor: $${sale.amount}\n` +
                    `Sua comissão: ${sale.commission}%`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    }
    
    res.json({ ok: true });
});

// ============ SERVIDOR ============
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        name: 'xROCKET FLOW 2030',
        version: '3.0.0',
        status: 'online',
        stores: stores.size
    });
});

app.listen(PORT, () => {
    console.log(`✅ Servidor xROCKET FLOW rodando na porta ${PORT}`);
    console.log(`🤖 Bot principal: @xRocketFlow_Bot`);
    console.log(`🏪 Lojas ativas: ${stores.size}`);
    console.log(`🤖 IA Gemini: ${GEMINI_API_KEY ? 'ATIVA' : 'INATIVA'}`);
    console.log(`💳 xRocket: ${XROCKET_API ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}`);
    
    bot.launch();
    console.log(`🚀 Bot iniciado com sucesso!`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
