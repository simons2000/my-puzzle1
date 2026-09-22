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
    const clientID = process.env.YAHOO_CLIENT_ID;

    for (const word of words) {
      let wordReading = "";

      // 【1】 Yahoo! JLP API（最優先・完全な辞書判定）
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

            // 正しい名詞/熟語として1単語（または適切な複合語）で辞書認識されているか
            if (tokens.length >= 1) {
              const fullReading = tokens.map(t => t[1] || "").join('');
              if (fullReading) {
                wordReading = fullReading.replace(/[\u30a1-\u30f6]/g, m =>
                  String.fromCharCode(m.charCodeAt(0) - 0x60)
                );
              }
            }
          }
        } catch (e) {}
      }

      // 【2】 Wiktionary / Wikipedia API (Yahoo未設定時の検索フォールバック)
      if (!wordReading) {
        try {
          // ja.wiktionary (日本語国語辞典) を優先検索
          const wiktionaryRes = await fetch(
            `https://ja.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&format=json&origin=*`
          );
          if (wiktionaryRes.ok) {
            const wData = await wiktionaryRes.json();
            const pages = wData?.query?.pages || {};
            const pageId = Object.keys(pages)[0];

            if (pageId !== "-1") {
              // Wiktionaryに存在する単語
              wordReading = await getFallbackReading(word);
            }
          }

          // WiktionaryになくWikipediaのリダイレクト/曖昧さ回避も含めて検索
          if (!wordReading) {
            const wikiRes = await fetch(
              `https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&redirects=1&format=json&origin=*`
            );
            if (wikiRes.ok) {
              const wikiData = await wikiRes.json();
              const pages = wikiData?.query?.pages || {};
              const pageId = Object.keys(pages)[0];

              if (pageId !== "-1") {
                wordReading = await getFallbackReading(word);
              }
            }
          }
        } catch (e) {}
      }

      // 実在辞書に全く引っかからなかった場合（例: 「一人風」など）
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

// 漢字ごとの音/訓読みから平仮名読みを組み立てる補助関数
async function getFallbackReading(word) {
  let fallback = "";
  for (const char of word) {
    const kRes = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
    if (kRes.ok) {
      const kData = await kRes.json();
      const onReadings = kData.on_readings || [];
      const kunReadings = kData.kun_readings || [];
      let r = onReadings.length > 0 ? onReadings[0] : (kunReadings[0] || char);
      fallback += r.replace(/\./g, '').replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
    } else {
      fallback += char;
    }
  }
  return fallback;
}
