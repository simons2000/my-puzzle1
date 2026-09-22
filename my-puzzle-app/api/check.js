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

    // 1. 各漢字の画数チェック (kanjiapi.dev)
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
      if (kanjiData.stroke_count !== expectedStroke) {
        return res.status(200).json({
          success: false,
          error: `「${char}」の画数は ${kanjiData.stroke_count}画 です（要求: ${expectedStroke}画）。`
        });
      }
    }

    // 2. 熟語の実在チェック & 読み取得
    const readings = [];
    const rawClientID = process.env.YAHOO_CLIENT_ID || "";
    const clientID = rawClientID.trim();

    for (const word of words) {
      let wordReading = "";

      // 【方法1】 Yahoo! JLP API（最優先）
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

            if (tokens.length >= 1) {
              const fullReading = tokens.map(t => t[1] || "").join('');
              if (fullReading) {
                // カタカナをひらがなに変換
                wordReading = fullReading.replace(/[\u30a1-\u30f6]/g, m =>
                  String.fromCharCode(m.charCodeAt(0) - 0x60)
                );
              }
            }
          } else {
            console.error('Yahoo API Res Not OK:', await yahooRes.text());
          }
        } catch (e) {
          console.error('Yahoo API Fetch Error:', e);
        }
      }

      // 【方法2】 API未設定または取得失敗時の自動救済フォールバック
      if (!wordReading) {
        // kanjiapi.devから読みを合成して救済（「人口」「一人前」などが拒否されるのを防ぐ）
        let fallbackReading = "";
        for (const char of word) {
          const kRes = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
          if (kRes.ok) {
            const kData = await kRes.json();
            const onReadings = kData.on_readings || [];
            const kunReadings = kData.kun_readings || [];
            // 音読み優先、無ければ訓読み
            let r = onReadings.length > 0 ? onReadings[0] : (kunReadings[0] || char);
            fallbackReading += r.replace(/\./g, '').replace(/[\u30a1-\u30f6]/g, m =>
              String.fromCharCode(m.charCodeAt(0) - 0x60)
            );
          } else {
            fallbackReading += char;
          }
        }
        wordReading = fallbackReading;
      }

      // 何らかの理由で読みが作れなかった場合のみ弾く
      if (!wordReading) {
        return res.status(200).json({
          success: false,
          error: `「${word}」は辞書に実在する熟語として認定されませんでした。`
        });
      }

      readings.push(wordReading);
    }

    return res.status(200).json({
      success: true,
      readings: readings
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'サーバー処理でエラーが発生しました。' });
  }
}
