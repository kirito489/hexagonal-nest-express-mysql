import { collectSourceFiles, readSource } from './helpers';

/**
 * 守則檔數量的下限。
 *
 * **只擋變少，不要求相等。** 要求精確相等的話，每加一條守則就要回來改一次
 * 這個數字——那種規則會被當成雜訊繞過，最後跟寫死在文件裡的數字一樣沒用。
 *
 * 新增守則時**不必動它**。累積一段時間後再往上調，那是一個刻意的動作，
 * 不是每次都要付的維護成本。
 */
const MINIMUM_GUARDRAIL_FILES = 23;

/** 文件裡「N 個規則檔」這類寫死的規模描述 */
const HARDCODED_COUNT =
  /\d+\s*(?:rule files|個規則檔|支規則檔|條守則檔|個守則檔|支守則)|\d+\s*支\s*\/\s*\d+\s*項斷言/i;

/**
 * 會被檢查的文件：專案說明、CLAUDE.md 與 README。
 *
 * **涵蓋範圍要跟著「哪裡會寫這種數字」走，不是跟著目錄結構走。**
 * 只掃 `openspec/project/` 的話，`CLAUDE.md` 與 `README.md` 裡的同一種漂移
 * 會原封不動地留著——本 change 導入時，那三個位置全部都是過期的。
 */
const DOC_FILES = [
  ...collectSourceFiles(['../../openspec/project'], { extensions: ['.md'] }),
  '../../CLAUDE.md',
  '../../README.md',
];

/**
 * 守則清單的自我維護。
 *
 * **這條守的是一個沒有人會發現的失效。** `CLAUDE.md` 曾經寫著
 * 「11 rule files / 32 assertions」，而實際是 19 / 69。那個數字的用途
 * 是讓未來的自己判斷「守則有沒有被誤刪」——一旦它落後，
 * 真正的減少就會躲在誤差裡看起來正常。
 *
 * **錯誤的基準值比沒有基準值更糟**，而它壞掉的方式是安靜地失去用途：
 * 沒有任何檢查會告訴你那行字已經不對了。
 *
 * 因此數字只留在這裡，由測試自己斷言；文件改成不帶數字的描述。
 */
describe('架構守則：守則清單必須自我維護', () => {
  const guardrails = collectSourceFiles(['test/architecture'], {
    extensions: ['.spec.ts'],
  });

  it('掃描範圍有效', () => {
    // 掃到 0 個代表目錄搬了而規則沒跟上，它會就此靜默空轉
    expect(guardrails.length).toBeGreaterThan(0);
    expect(DOC_FILES.length).toBeGreaterThan(1);
  });

  it('守則檔數量不得低於基準', () => {
    expect(
      guardrails.length >= MINIMUM_GUARDRAIL_FILES
        ? ''
        : `守則檔從 ${MINIMUM_GUARDRAIL_FILES} 個減少到 ${guardrails.length} 個。\n` +
            '刪除守則可以，但要是刻意的：確認後把 MINIMUM_GUARDRAIL_FILES 一起調降，\n' +
            '並在該 change 的 tasks.md 寫下理由。\n' +
            '若不是刻意的，那就是誤刪——這正是本規則存在的原因。',
    ).toBe('');
  });

  /**
   * 文件不得寫死守則數量。
   *
   * 這是同一條規則的另一半：數字只在測試裡，文件裡不該有第二份，
   * 因為第二份一定會先過期。
   */
  it('文件不得以寫死的數字描述守則規模', () => {
    const offenders = DOC_FILES.filter((file) =>
      HARDCODED_COUNT.test(readSource(file)),
    ).map((file) => `  ${file}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下文件寫死了守則數量：\n${offenders.join('\n')}\n` +
            '數字會過期，而過期的基準值比沒有基準值更糟——它讓真正的減少看起來正常。\n' +
            '請改成不帶數字的描述，數量交給 test:arch 自己斷言。',
    ).toBe('');
  });

  /**
   * 守則清單的文件必須完整。
   *
   * `testing.md` 有一張「每一支守則守住什麼」的表。靠自律維護的清單一定會漂移
   * ——衍生專案就發生過列 19 支而實際 29 支，**漏掉的裡面有好幾支是剛加的**，
   * 加的人沒想到要回頭補表。
   *
   * 改成機器檢查之後，**新增一支守則卻沒補文件就會紅**，
   * 而那正是唯一會被記得的時機。
   *
   * ⚠️ **已知弱點：判定只看「有沒有被反引號提到」，不看是不是規則表裡的一列。**
   * 本檔導入時就親自示範了——內文有一句「數量由 `guardrail-inventory.spec.ts`
   * 自己斷言」，那個順帶的提及讓檢查直接通過，而規則表裡當時還沒有它。
   * 沒有改成解析表格，是因為那會綁死 Markdown 的排版格式（欄位數、對齊、換行），
   * 而那種耦合的維護成本高於它擋下的東西。
   * 補表時要自己確認補的是**表格的一列**，不是散文裡的一次提及。
   */
  it('testing.md 必須涵蓋每一支守則', () => {
    const documented = new Set(
      [
        ...readSource('../../openspec/project/testing.md').matchAll(
          /`([a-z0-9-]+\.spec\.ts)`/g,
        ),
      ].map((m) => m[1]),
    );
    const missing = guardrails
      .map((file) => file.split('/').pop() ?? file)
      .filter((name) => !documented.has(name))
      .map((name) => `  ${name}`);

    expect(
      missing.length === 0
        ? ''
        : `以下守則沒有記錄在 openspec/project/testing.md 的規則表：\n${missing.join('\n')}\n` +
            '新增守則時要一併補一列說明它守住什麼——那是唯一會被記得的時機。',
    ).toBe('');
  });

  // 規則自身的測試：樣式抓不到東西的話，上面那條會永遠通過
  describe('判定邏輯（合成輸入）', () => {
    it.each([
      ['11 rule files / 32 assertions', true],
      ['22 個規則檔', true],
      ['19 支規則檔 / 68 項斷言', true],
      ['11 條守則檔', true],
      ['19 支 / 68 項斷言', true],
      ['架構守則（數量見 test:arch 輸出）', false],
      ['共 11 支 e2e 測試', false],
      ['api 70/60/70/70 覆蓋率門檻', false],
    ])('%s → %s', (text, expected) => {
      expect(HARDCODED_COUNT.test(text)).toBe(expected);
    });
  });
});
