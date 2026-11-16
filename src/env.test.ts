import { describe, expect, it } from "vitest";
import { addEntry, isSensitive, parseEnv, updateValue } from "./env";

describe("环境文件编辑", () => {
  it("默认隐藏凭据和包含凭据的地址", () => {
    expect(isSensitive("AUTHORIZATION")).toBe(true);
    expect(
      isSensitive("SERVICE_URL", "https://user:password@example.test"),
    ).toBe(true);
    expect(isSensitive("APP_PORT", "5000")).toBe(false);
  });

  it("修改值时保留带引号的 # 和行尾注释", () => {
    const source =
      '# header\nURL="https://example.test/#section" # description\n';
    const [entry] = parseEnv(source);
    expect(entry.value).toBe('"https://example.test/#section"');
    expect(updateValue(source, entry, '"https://new.test/#new"')).toBe(
      '# header\nURL="https://new.test/#new" # description\n',
    );
  });

  it("编辑和新增时保留 CRLF 换行", () => {
    const source = "FIRST=one\r\n\r\nSECOND=two\r\n";
    const [entry] = parseEnv(source);
    expect(updateValue(source, entry, "changed")).toBe(
      "FIRST=changed\r\n\r\nSECOND=two\r\n",
    );
    expect(addEntry(source, "THIRD", "three")).toBe(
      "FIRST=one\r\n\r\nSECOND=two\r\n\r\nTHIRD=three\r\n",
    );
  });
});
