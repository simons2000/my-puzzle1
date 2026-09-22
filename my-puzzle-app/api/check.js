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
      const actualStroke = kanjiData.stroke_count;

      if (actualStroke !== expectedStroke) {
        return res.status(200).json({
          success: false,
          error: `「${char}」の画数は ${actualStroke}画 です（要求: ${expectedStroke}画）。`
        });
      }
    }

    // 2. 熟語全体の読み（ひらがな）を gooラボ API または Yahoo API で辞書検索
    const readings = [];
    const clientID = process.env.YAHOO_CLIENT_ID;

    for (const word of words) {
      let wordReading = "";

      // 【方法A】 Yahoo JLP API が設定されている場合
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
              const katakanaReading = tokens.map(t => t[1] || "").join('');
              wordReading = katakanaReading.replace(/[\u30a1-\u30f6]/g, m => 
                String.fromCharCode(m.charCodeAt(0) - 0x60)
              );
            }
          }
        } catch (e) {}
      }

      // 【方法B】 登録なしで使えるオープンな辞書変換（Wikipedia/goo等互換のエンドポイント）
      if (!wordReading) {
        try {
          // 例：gooラボひらがな化API (APIキー不要な公開エンドポイントまたは代替形態素解析)
          const hiraganaRes = await fetch(`https://labs.goo.ne.jp/api/hiragana`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: process.env.GOO_APP_ID || "DEMO_APP_ID",
              sentence: word,
              output_type: "hiragana"
            })
          });

          if (hiraganaRes.ok) {
            const gData = await hiraganaRes.json();
            if (gData.converted) {
              wordReading = gData.converted.replace(/\s+/g, '');
            }
          }
        } catch (e) {}
      }

      // 【最終フォールバック】辞書APIが未設定の場合の標準辞書マッピング表
      if (!wordReading) {
        const commonDictionary = {
          "人口": "じんこう",
          "大金": "たいきん",
          "合金": "ごうきん",
          "一人前": "いちにんまえ",
          "七人組": "しちにんぐみ",
          "大人": "おとな",
          "今日": "きょう"
        };
        wordReading = commonDictionary[word] || word; // 登録がない場合はそのまま文字を表示
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
