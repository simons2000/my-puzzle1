import kuromoji from 'kuromoji';
import path from 'path';

// kuromoji の辞書インスタンスをキャッシュ（コールドスタート対策）
let tokenizerPromise = null;

function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      // kuromoji の辞書ファイルのパスを指定
      const dicPath = path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict');
      kuromoji.builder({ dicPath }).build((err, tokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
    });
  }
  return tokenizerPromise;
}

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

    // 1. 漢字1文字ずつの画数判定 (kanjiapi.dev)
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

    // 2. kuromoji による形態素解析・熟語実在チェックおよび読み取得
    const tokenizer = await getTokenizer();
    const readings = [];

    for (const word of words) {
      const tokens = tokenizer.tokenize(word);

      // ① 辞書に存在する「1つの単語（名詞）」として認識されているか判定
      // 「一人風」のように未知語や複数単語に分解されるものは不正とみなす
      const isValidSingleWord = tokens.length === 1 && 
        (tokens[0].pos === '名詞' || tokens[0].pos_detail_1 === '数接続');

      if (!isValidSingleWord) {
        return res.status(200).json({
          success: false,
          error: `「${word}」は辞書に実在する熟語として登録されていません。`
        });
      }

      // ② 辞書から標準的な読み（カタカナ）を取得し、ひらがなに変換
      const katakanaReading = tokens[0].reading;
      if (!katakanaReading || katakanaReading === '*') {
        return res.status(200).json({
          success: false,
          error: `「${word}」の読みが取得できませんでした。`
        });
      }

      // カタカナをひらがなに変換
      const hiraganaReading = katakanaReading.replace(/[\u30a1-\u30f6]/g, m =>
        String.fromCharCode(m.charCodeAt(0) - 0x60)
      );

      readings.push(hiraganaReading);
    }

    return res.status(200).json({
      success: true,
      readings: readings
    });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: '形態素解析の実行中にエラーが発生しました。' });
  }
}
