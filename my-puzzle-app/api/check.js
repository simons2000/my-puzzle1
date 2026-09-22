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

    const readings = [];

    // 1. 各漢字の画数チェック
    for (let i = 0; i < 9; i++) {
      const char = allKanji[i];
      const expectedStroke = parseInt(targetDigits[i], 10);

      const kanjiRes = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
      if (!kanjiRes.ok) {
        return res.status(200).json({
          success: false,
          error: `「${char}」の漢字データが見つかりませんでした。`
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

    // 2. 熟語の読み取得（音読み優先ロジック）
    const clientID = process.env.YAHOO_CLIENT_ID;

    for (const word of words) {
      let wordReading = "";

      // Yahoo APIが設定されている場合は形態素解析で正確な読みを取得
      if (clientID) {
        try {
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

          if (yahooRes.ok) {
            const yahooData = await yahooRes.json();
            const tokens = yahooData?.result?.tokens || [];
            if (tokens.length >= 1 && tokens[0][1]) {
              // トークンの読みを連結（カタカナをひらがなに変換）
              const katakanaReading = tokens.map(t => t[1] || "").join('');
              wordReading = katakanaReading.replace(/[\u30a1-\u30f6]/g, m => 
                String.fromCharCode(m.charCodeAt(0) - 0x60)
              );
            }
          }
        } catch (e) {
          // エラー時はフォールバックへ
        }
      }

      // APIキーなし / Yahoo取得失敗時のフォールバック処理
      // 漢語（熟語）は音読み（on_readings）が基本のため、on_readingsを優先取得
      if (!wordReading) {
        let fallbackReading = "";
        for (const char of word) {
          const kRes = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
          if (kRes.ok) {
            const kData = await kRes.json();
            // 音読み(on_readings)を最優先、無ければ訓読み(kun_readings)
            const onReadings = kData.on_readings || [];
            const kunReadings = kData.kun_readings || [];
            
            let selectedReading = onReadings.length > 0 ? onReadings[0] : (kunReadings[0] || char);
            
            // カタカナをひらがなに変換＆送り仮名表記（.）の除去
            selectedReading = selectedReading
              .replace(/\./g, '')
              .replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));

            fallbackReading += selectedReading;
          } else {
            fallbackReading += char;
          }
        }
        wordReading = fallbackReading;
      }

      readings.push(wordReading);
    }

    return res.status(200).json({
      success: true,
      readings: readings
    });

  } catch (err) {
    return res.status(500).json({ error: 'サーバー判定処理でエラーが発生しました。' });
  }
}
