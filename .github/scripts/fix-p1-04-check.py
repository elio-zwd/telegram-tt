from pathlib import Path


def replace_once(path, old, new, label):
    file_path = Path(path)
    content = file_path.read_text(encoding='utf-8')
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: 预期匹配 1 次，实际 {count} 次')
    file_path.write_text(content.replace(old, new, 1), encoding='utf-8')


replace_once(
    'tampermonkey/build/verify-web-k-userscript.mjs',
    "  assertCondition(/PHOTO_DURATION_MIN_MS\\s*=\\s*1e3\\b|PHOTO_DURATION_MIN_MS\\s*=\\s*1000\\b/.test(generated), '生成文件缺少 1 秒自定义下限');\n  assertCondition(/PHOTO_DURATION_MAX_MS\\s*=\\s*3e5\\b|PHOTO_DURATION_MAX_MS\\s*=\\s*300000\\b/.test(generated), '生成文件缺少 300 秒自定义上限');",
    "  assertCondition(\n    /function isValidPhotoDurationMs\\(value\\) \\{\\s*return Number\\.isInteger\\(value\\) && value >= (?:1e3|1000) && value <= (?:3e5|300000) && value % 100 === 0;\\s*\\}/.test(generated),\n    '生成文件缺少 1～300 秒和一位小数精度校验',\n  );",
    '生成文件时间边界门禁',
)
replace_once(
    'tampermonkey/src/web-k/features/control-panel/control-panel.js',
    '              maxlength="5"\n',
    '',
    '自定义输入长度限制',
)
print('P1-04 static check fixed')
