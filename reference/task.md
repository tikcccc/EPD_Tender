为支持 EPD Tender AI 项目，需上线一个前端页面(如果必要可以加入後端），用于展示同事已完成的 Tender 分析报告（reference/test.json）。

tender是兩個pdf在reference

code.html的靜態的原型參考頁面，開發的頁面UI要base on 這個原型

该页面需满足以下核心功能：
Standard 管理
展示所有可用 Standard 列表
允许用户手动勾选所需 Standard
提供“NEC 模板”快捷选项，一键填充 NEC 体系预设的 Standard 集合

优先级自定义
用户可调整所选 Standard 的优先级顺序（如拖拽排序）
支持一键恢复 NEC 体系定义的默认优先级

报告卡片展示与 PDF 溯源
将分析报告按卡片形式渲染（每卡包含结论、关联 Standard、Evidence 等）
点击 Evidence 可跳转至源 PDF 对应页面，并高亮相关片段（需支持页面跳转与文本定位）

报告导出
提供“输出报告”按钮，生成符合固定格式的文档（如 Word 或 PDF）
输出内容需包含用户选定的 Standard（含优先级）及所有卡片信息


输入依赖：同事将提供结构化 JSON 报告数据；NEC 模板的 Standard 列表与默认优先级需另行确认。


