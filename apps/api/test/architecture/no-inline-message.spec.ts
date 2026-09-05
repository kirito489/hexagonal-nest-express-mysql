import {
  collectSourceFiles,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/**
 * 會產生對外訊息的層。
 *
 * **範圍要跟著「哪裡會產生對外訊息」走，不是跟著「這次發現的違規在哪」走。**
 * 原本只掃 `domain/exception/`，於是二十多處寫在 guard 與 service 的文案完全不在
 * 視野內——而它們經 `GlobalExceptionFilter` 的 `message: exception.message`
 * 原樣送給客戶端，地位與 domain exception 的訊息相同。
 */
const MESSAGE_PRODUCING_DIRS = [
  'src/adapter/in/web',
  'src/application/service',
  'src/infrastructure',
];

/**
 * 例外建構子的字面值引數：`new XxxException('中文…')`。
 *
 * ⚠️ **不能用「任何中文字串」當判準**——那是 `domain/exception/` 專屬的簡化，
 * 因為那些檔案裡只有例外建構。擴大到 guard 與 service 之後，同一個判準會掃到
 * 一堆**不是對外訊息**的東西：logger 訊息（只進日誌）、System Log 的 action 名、
 * 信件主旨、Zod 的欄位驗證訊息、health indicator 的狀態描述。
 * 實測用寬判準會得到 79 處，其中真正的違規只有二十多處——
 * **而把那 50 幾處塞進豁免清單就等於規則死了**。
 *
 * 三種引號都要涵蓋。本規則導入時的盤點第一次只寫了單引號，
 * 於是三處樣板字串沒被抓到——**用來畫範圍的工具本身有盲區時，
 * 得到的清單會看起來很完整**。
 */
const EXCEPTION_LITERAL = /new \w*Exception\(\s*['"`][^'"`]*[一-鿿]/;

/** `domain/exception/` 用得起的寬判準：那些檔案的程式碼本體只有 code、kind 與 import */
const ANY_CJK_STRING = /['"`][^'"`]*[一-鿿]/;

// TSDoc 註解含 markdown 反引號（如 `code`），直接比對「引號 + 中文」會把註解誤判成字串
const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

const scan = (files: string[], pattern: RegExp): Violation[] => {
  const offenders: Violation[] = [];
  for (const file of files) {
    readSource(file)
      .split('\n')
      .forEach((text, index) => {
        if (isComment(text)) return;
        if (pattern.test(text)) {
          offenders.push({ file, line: index + 1, text: text.trim() });
        }
      });
  }
  return offenders;
};

/**
 * 錯誤文案一律取自 `response-messages.ts`，程式碼中不得內嵌字面值。
 *
 * 訊息表建立後最容易腐化的方式，是有人為了「只是加一個小 exception」又把文案
 * 寫回 constructor —— 一旦開始，集中管理就名存實亡。
 *
 * **兩個掃描範圍用不同的判準**，因為它們的檔案內容性質不同：
 * `domain/exception/` 裡沒有 log 也沒有驗證訊息，可以用寬判準；
 * guard 與 service 有一堆內部字串，只能精準比對例外建構子的引數。
 */
describe('架構守則：exception 不得內嵌文案', () => {
  const exceptionFiles = collectSourceFiles(['src/domain/exception'], {
    exclude: ['.spec.ts'],
  });
  const producerFiles = collectSourceFiles(MESSAGE_PRODUCING_DIRS, {
    exclude: ['.spec.ts'],
  });

  it('掃描範圍有效', () => {
    expect(exceptionFiles.length).toBeGreaterThan(0);
    // 只掃到 exception 目錄代表範圍設定失效，規則會退回原本的盲區
    expect(producerFiles.some((f) => f.includes('adapter/in/web/guard'))).toBe(
      true,
    );
    expect(producerFiles.some((f) => f.includes('application/service'))).toBe(
      true,
    );
  });

  it('domain exception 內不得出現中文字串字面值', () => {
    expect(
      violationReport(
        scan(exceptionFiles, ANY_CJK_STRING),
        '以下 exception 內嵌了中文文案：請改為在 shared/constants/response-messages.ts 定義，靜態訊息只需 super(code, kind)',
      ),
    ).toBe('');
  });

  it('guard / service / infrastructure 拋例外時不得內嵌文案', () => {
    expect(
      violationReport(
        scan(producerFiles, EXCEPTION_LITERAL),
        '以下位置在建立 exception 時內嵌了中文文案：請改為引用 shared/constants/response-messages.ts。' +
          '拋 DomainException 用 ResponseMessages，拋框架 HttpException 用 HttpMessages',
      ),
    ).toBe('');
  });

  // 規則自身的測試：判定寫錯是靜默的，而偽陰性的守則比沒有守則更危險
  describe('例外引數的判定（合成輸入）', () => {
    it.each([
      ["throw new ForbiddenException('權限不足');", true],
      ['throw new InvalidUploadException(`檔案過大（${n}）`);', true],
      ['throw new UnauthorizedException("帳號或密碼錯誤");', true],
      [
        'throw new ForbiddenException(HttpMessages.INSUFFICIENT_PERMISSION);',
        false,
      ],
      // 以下三種是**內部**字串，不是對外訊息——寬判準會誤抓它們
      ["this.logger.warn('Token 已在黑名單中');", false],
      ["await this.saveAuthLog({ detail: '帳號不存在' });", false],
      ["email: z.string().email('請輸入有效的電子郵件'),", false],
    ])('%s → %s', (line, expected) => {
      expect(EXCEPTION_LITERAL.test(line)).toBe(expected);
    });
  });
});
