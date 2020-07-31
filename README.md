## 描述

有关小说阅读的 CLI 工具套件

## 安装

```bash
npm i -g @pot-code/novel 
```

## 使用

```bash
novel <command> [option]
```

已有的 command：

- download

### download

下载（抓取）小说资源，需要提供一份配置文件。可选项：

- `--config,-c`，指定配置文件路径
- `--out,-o`，指定输出文件，默认导出到当前执行命令的目录，文件名为 `out.txt`
- `--template`，让 CLI 工具导出一份空配置文件，默认导出到 stdout，该选项和 `--config` 不能同时出现，择其一使用

配置文件说明：

```json
{
  "heading": "", // 要抓取小说的第一章（或其他章节作为开始的）网址，和 next 属性必须成对出现
  "next": "", // 下一章节按钮的选择器，要求元素类型为 anchor 类型，且包含正确的 href 值，暂不支持 js 驱动的按钮元素
  "catalog": { // 也可以直接提供目录所在网址，优先级比 heading 和 next 要高，两者可择其一出现
    "url": "", // 目录网址
    "selector": "", // 章节列表每个章节条目元素的选择器，要求元素类型为 anchor 类型，且包含正确的 href 值，暂不支持 js 驱动的按钮元素
    "skip": 0 // 跳过多少个章节（从开头算起）
  },
  "title": "", // 文章页面标题所在元素的选择器
  "content": "", // 文章页面内容所在元素的选择器
  "limit": 0, // 限制抓取章节个数，-1 为不限制
  "split": false, // 保留选项，暂无作用
  "wait": 0, // 每次抓取的等待间隔，用于反反爬虫
  "append": false, // 默认输出文件时会清空目标文件内容，指定此选项为 true 则让当前输出追加到目标文件的末尾
  "headless": true // 因为程序需要开启一个 chromium 进程，此选项设置是否隐藏它的界面展示，为 true 则隐藏
}
```

## 已知问题

- 只支持 MacOS
- 固定浏览器执行路径：`/Applications/Chromium.app/Contents/MacOS/Chromium`，后期支持 CLI 选项更改