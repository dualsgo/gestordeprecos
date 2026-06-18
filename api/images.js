import { kv } from '@vercel/kv';

const HASH_KEY = 'global_images_db';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verifica se o Vercel KV está configurado (Variáveis de Ambiente)
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ 
        error: "Vercel KV não configurado.", 
        message: "Por favor, configure o Redis na Vercel." 
    });
  }

  try {
    if (req.method === 'GET') {
      const db = await kv.hgetall(HASH_KEY) || {};
      return res.status(200).json(db);
    } 
    
    else if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { codInt, imageUrl, productName } = body;
      
      if (!codInt) {
        return res.status(400).json({ error: "O campo codInt é obrigatório" });
      }

      const payload = {
        [codInt]: { image: imageUrl, nome: productName }
      };

      await kv.hset(HASH_KEY, payload);
      return res.status(200).json({ success: true });
    } 
    
    else if (req.method === 'DELETE') {
      const { codInt } = req.query;
      
      if (!codInt) {
        return res.status(400).json({ error: "O campo codInt na URL é obrigatório" });
      }

      await kv.hdel(HASH_KEY, codInt);
      return res.status(200).json({ success: true });
    } 
    
    else {
      return res.status(405).json({ error: "Método não permitido" });
    }
  } catch (error) {
    console.error("KV Error (Images API):", error);
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
}
