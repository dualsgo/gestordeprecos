import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verifica se o Vercel KV está configurado (Variáveis de Ambiente)
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ 
        error: "Vercel KV não configurado.", 
        message: "Por favor, ative a integração do Redis na Vercel e re-implante o projeto." 
    });
  }

  try {
    if (req.method === 'POST') {
      // SALVAR SESSÃO (Desktop)
      // O corpo requisição deve ser os dados parseados do Excel.
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      
      // Gera um ID simples de 6 letras/números para o QR Code
      const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Salva no Redis com expiração de 2 horas (7200 segundos)
      await kv.set(`session:${sessionId}`, JSON.stringify(data), { ex: 7200 });

      return res.status(200).json({ success: true, sessionId });
    } 
    
    else if (req.method === 'GET') {
      // BUSCAR SESSÃO (Celular)
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ error: "ID da sessão é obrigatório." });
      }

      const sessionData = await kv.get(`session:${id}`);
      
      if (!sessionData) {
        return res.status(404).json({ error: "Sessão não encontrada ou expirada." });
      }

      // Devolve o JSON salvo
      return res.status(200).json(sessionData);
    } 
    
    else {
      return res.status(405).json({ error: "Método não permitido" });
    }
  } catch (error) {
    console.error("KV Error:", error);
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
}
