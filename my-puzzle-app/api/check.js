export default async function handler(req, res) {
  // CORSヘッダー設定（どこからでもアクセス可能にする）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { words, targetStrokes } = req.body;

  // 1. 簡易画数辞書（API側で管理・後からいくらでも拡張可能）
  const strokeDict = {
    '一': 1, '人': 2, '入': 2, '八': 2, '九': 2, '七': 2, '力': 2, '十': 2,
    '口': 3, '大': 3, '小': 3, '山': 3, '川': 3, '女': 3, '子': 3, '三': 3, '千': 3,
    '月': 4, '日': 4, '水': 4, '木': 4, '火': 4, '天': 4, '文': 4, '心': 4, '手': 4, '中': 4,
    '生': 5, '立': 5, '目': 5, '田': 5, '右': 5, '左': 5, '本': 5, '白': 5, '玉': 5, '学': 5,
    '気': 6, '字': 6, '竹': 6, '名': 6, '百': 6, '先': 6, '早': 6, '虫': 6, '交': 6,
    '角': 7, '町': 7, '花': 7, '見': 7, '貝': 7, '赤': 7, '足': 7, '車': 7, '男': 7,
    '金': 8, '雨': 8, '命': 8, '青': 8, '林': 8, '空': 8, '知': 8, '長': 8,
    '風': 9, '海': 9, '音': 9, '草': 9, '食': 9, '首': 9, '面': 9, '春': 9, '秋': 9
  };

  // 2. 熟語・読み判定辞書
  const kanjiReadingMap = {
    '人口': 'じんこう',
    '大金': 'たいきん',
    '風水': 'ふうすい',
    '一学生': 'いちがくせい'
  };

  try {
    const kanjis = words.join('').split('');

    // 画数チェック
    for (let i = 0; i < 9; i++) {
      const targetStroke = parseInt(targetStrokes[i]);
      const k = kanjis[i];
      const stroke = strokeDict[k];

      if (!stroke) {
        return res.json({ success: false, errorMessage: `「${k}」の画数データが見つかりません。` });
      }
      if (stroke !== targetStroke) {
        return res.json({ success: false, errorMessage: `${i+1}文字目「${k}」は${stroke}画ですが、正解は${targetStroke}画です。` });
      }
    }

    // 熟語チェック
    const readings = words.map(w => kanjiReadingMap[w]);
    if (readings.some(r => !r)) {
      return res.json({ success: false, errorMessage: "実在する正しい熟語を入力してください。" });
    }

    return res.json({ success: true, readings });

  } catch (err) {
    return res.status(500).json({ success: false, errorMessage: "サーバー内部エラーが発生しました。" });
  }
}