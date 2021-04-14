# Novel

## 描述

有关小说的 CLI 工具

![multi-thread](./preview/m_d.gif)

![single-thread](./preview/s_d.gif)

## 安装

>没有 npm install？没有

```bash
git clone https://github.com/pot-code/novel.git
cd novel
npm install
npm i -g ./
```

## 使用

```bash
novel <command> [option]
```
## command

### download

下载资源，需要提供一份配置文件。可选项：

- `--config,-c`，指定配置文件路径
- `--out,-o`，指定输出文件，默认导出到当前执行命令的目录，文件名为 `out.txt`
- `--template`，让 CLI 工具导出一份空配置文件，默认导出到 stdout，该选项和 `--config` 不能同时出现，择其一使用
- `--worker,-w`，设置抓取的线程数（默认为 CPU 线程数）。多线程抓取，速度更快，仅当配置文件提供了 `list_selector` 字段时生效。

>注意散热，抓取过程 CPU 占用较高，过热容易导致抓取失败、报错

配置文件说明：

```jsonc
{
  "url": "", // 目录网址或小说的第一章（或其他章节作为开始的）网址
  "list_selector": "", // 章节列表每个章节条目元素的选择器，要求元素类型为 anchor 类型，且包含正确的 href 值，暂不支持 js 驱动的按钮元素
  "next_selector": "", // 下一章节按钮的选择器，要求元素类型为 anchor 类型，且包含正确的 href 值，暂不支持 js 驱动的按钮元素
  "title": "", // 文章页面标题所在元素的选择器
  "content": "", // 文章页面内容所在元素的选择器
  "limit": 0, // 限制抓取章节个数，-1 为不限制
  "wait": 0, // 每次抓取的等待间隔，用于反反爬虫，默认 100ms
}
```

程序会在命令执行所在目录、创建临时目录存放中间下载结果，方便出现错误或强制退出后，跳过已下载部分，加速下载流程，如无必要切勿删除。下载完成后程序会自动清理。