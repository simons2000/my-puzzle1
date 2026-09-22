export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { words, targetDigits } = req.body;

  if (!words || !targetDigits || words.length !== 4 || targetDigits.length !== 9) {
    return res.status(400).json({ error: '入力データが不正です。' });
  }

  try {
    const allKanji = words.join('');
    if (allKanji.length !== 9) {
      return res.status(400).json({ error: '文字数の合計が9文字になりません。' });
    }

    // 1. 各文字の画数チェック (kanjiapi.dev)
    for (let i = 0; i < 9; i++) {
      const char = allKanji[i];
      const expectedStroke = parseInt(targetDigits[i], 10);

      const kanjiRes = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
      if (!kanjiRes.ok) {
        return res.status(200).json({
          success: false,
          error: `「${char}」は漢字データが見つかりません。`
        });
      }

      const kanjiData = await kanjiRes.json();
      const actualStroke = kanjiData.stroke_count;

      if (actualStroke !== expectedStroke) {
        return res.status(200).json({
          success: false,
          error: `「${char}」の画数は ${actualStroke}画 です（要求: ${expectedStroke}画）。`
        });
      }
    }

    // 2. 熟語の実在チェック＆読み取得 (Yahoo! JLP 形態素解析)
    const readings = [];
    const clientID = process.env.YAHOO_CLIENT_ID; // Vercelの環境変数

    for (const word of words) {
      if (!clientID) {
        // 環境変数が設定されていない場合のフォールバック（画数のみパス）
        readings.push(word); 
        continue;
      }

      const yahooRes = await fetch('https://jlp.yahooapis.jp/MAService/V2/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `Yahoo AppID: ${clientID}`
        },
        body: JSON.stringify({
          id: '1',
          jsonrpc: '2.0',
          method: 'jlp.maservice.parse',
          params: { q: word }
        })
      });

      if (!yahooRes.ok) {
        readings.push(word);
        continue;
      }

      const yahooData = await yahooRes.json();
      const tokens = yahooData?.result?.tokens || [];

      // 単語として分割されず1つの名詞/熟語として認識されているか
      if (tokens.length === 1 && tokens[0][1] !== undefined) {
        // 読み（ひらがな）を抽出
        const reading = tokens[0][1]; 
        readings.push(reading);
      } else {
        return res.status(200).json({
          success: false,
          error: `「${word}」は辞書に熟語として登録されていません。`
        });
      }
    }

    return res.status(200).json({
      success: true,
      readings: readings
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバー判定処理でエラーが発生しました。' });
  }
}
