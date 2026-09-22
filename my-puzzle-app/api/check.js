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

    // 1. 各漢字の画数チェック & 読み取得 (kanjiapi.dev)
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

    // 2. 各熟語の読み（ひらがな）を取得
    // Yahoo JLP API等の外部APIが設定されていればそれを使用し、無ければフォールバック
    const clientID = process.env.YAHOO_CLIENT_ID;

    for (const word of words) {
      let wordReading = "";

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
            if (tokens.length === 1 && tokens[0][1]) {
              wordReading = tokens[0][1];
            }
          }
        } catch (e) {
          // Yahoo APIエラー時はスキップしてフォールバックへ
        }
      }

      // Yahoo APIで取得できなかった場合のフォールバック（文字ごとのオン/クン読み候補から平仮名化）
      if (!wordReading) {
        let fallbackReading = "";
        for (const char of word) {
          const kRes = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
          if (kRes.ok) {
            const kData = await kRes.json();
            const readingsList = [...(kData.kun_readings || []), ...(kData.on_readings || [])];
            if (readingsList.length > 0) {
              // 濁点などを簡易変換してひらがなに統一
              let r = readingsList[0].replace(/\./g, '').replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
              fallbackReading += r;
            } else {
              fallbackReading += char;
            }
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
