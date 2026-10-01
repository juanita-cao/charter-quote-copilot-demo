// Sample Help Center content (v1.0). The client is expected to replace or extend it; it is static and bilingual.
export type Lang = "en" | "zh";
export interface HelpArticle {
  id: string;
  question: Record<Lang, string>;
  answer: Record<Lang, string[]>;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "what-is-tce",
    question: { en: "What is TCE?", zh: "什么是 TCE？" },
    answer: {
      en: [
        "Time charter equivalent (TCE) is what a voyage earns per day once the voyage costs — bunkers, port charges and commission — are taken out, in USD per day.",
        "It lets you compare a voyage with a time-charter hire. In this tool, Est. TCE is the TCE at the freight rate you are quoting; Owner Ask is the daily figure the shipowner wants.",
      ],
      zh: [
        "TCE（期租等价租金）是扣除航次成本（燃油、港口费用、佣金）之后，一个航次平均每天的收入，单位为美元/天。",
        "有了它，就可以把一个航次和期租租金直接比较。本工具中的“预估日租金”是按你报的运费算出的 TCE，“船东要价”是船东想要的每日租金。",
      ],
    },
  },
  {
    id: "verdict",
    question: { en: "How do I get a GO / NO-GO verdict?", zh: "怎样得到 GO / NO-GO 结论？" },
    answer: {
      en: [
        "Fill in the required fields (marked with *) and click Run. The result shows the estimated TCE, the margin and a GO or NO-GO decision.",
        "The decision is GO when the profit margin meets or exceeds your GO threshold, which is set in the Benchmarks & Threshold group; otherwise it is NO-GO. The reason line under the cards says which.",
      ],
      zh: [
        "填完必填项（带 * 的字段），点击“航次测算”。结果会显示预估日租金、利润率，以及 GO 或 NO-GO 决策。",
        "利润率达到或超过你设定的 GO 阈值（在“基准与阈值”一组里设置）时为 GO，否则为 NO-GO。卡片下方的说明会写明原因。",
      ],
    },
  },
  {
    id: "stale",
    question: { en: "Why is my result greyed out?", zh: "为什么结果变灰了？" },
    answer: {
      en: [
        "Nothing is calculated until you click Run, and the result is not updated by itself. As soon as you change an input (or the calculation precision), the result on screen no longer matches your inputs, so it is greyed out with a note.",
        "Click Run again to update it. Save Quote is only available while the result matches the inputs.",
      ],
      zh: [
        "点击“航次测算”之前不会计算，结果也不会自动更新。一旦你改动了输入（或计算精度），屏幕上的结果就和输入不一致了，所以会变灰并给出提示。",
        "再点一次“航次测算”即可更新。只有结果与输入一致时，才能保存报价。",
      ],
    },
  },
  {
    id: "precision",
    question: { en: "What is the difference between display precision and full precision?", zh: "显示精度和全精度有什么区别？" },
    answer: {
      en: [
        "Display precision (the default) rounds every USD amount to 2 decimals at each step, the way a calculator or a spreadsheet set to “precision as displayed” does, so the figures agree with a hand check or with Finance.",
        "Full precision does no rounding during the calculation and only rounds what is shown. In rare borderline cases the two can give a different GO / NO-GO. Choose the precision next to the Run button before you click Run.",
        "With a special passage (Yangtze estuary, Qiongzhou Strait), display precision works out a leg's days the way a spreadsheet does: the rounded leg days minus the rounded special-passage days.",
      ],
      zh: [
        "显示精度（默认）在每一步都把美元金额四舍五入到 2 位小数，和计算器、设为“以显示精度为准”的 Excel 一致，便于和手工核算或财务对齐。",
        "全精度在计算过程中不做任何取整，只在显示时取整。极少数临界情况下，两种方式可能得出不同的 GO / NO-GO。请在点击“航次测算”之前，在按钮旁选好计算精度。",
        "有特殊航段（长江口、琼州海峡）时，显示精度下某一段的天数和 Excel 一样计算：该段取整后的天数，减去特殊航段取整后的天数。",
      ],
    },
  },
  {
    id: "totals",
    question: { en: "How are quantity, freight rate and total freight related?", zh: "货量、单吨运费和总运费是什么关系？" },
    answer: {
      en: [
        "Total freight is the quantity multiplied by the freight rate. Change the quantity or the rate and the total follows.",
        "If you type a total freight instead, the quantity is kept and the freight rate is worked out from it.",
      ],
      zh: [
        "总运费 = 货量 × 单吨运费。改动货量或运费，总运费随之变化。",
        "如果你直接输入总运费，则货量保持不变，单吨运费由总运费反算出来。",
      ],
    },
  },
  {
    id: "spread",
    question: { en: "What is the hire spread against the owner's ask?", zh: "“对比船东要价的租金价差”是什么？" },
    answer: {
      en: [
        "It is Est. TCE minus the shipowner's asking TCE, in USD per day. A positive spread means the voyage earns more than the owner is asking.",
        "A negative spread shows a warning: it is not recommended to accept unless there is a strategic reason. It is a prompt, not a block.",
      ],
      zh: [
        "价差 = 预估日租金 − 船东要价，单位为美元/天。价差为正，说明航次收入高于船东的要价。",
        "价差为负时会出现提示：除非有战略上的理由，否则不建议接受。这只是提醒，不会阻止你继续操作。",
      ],
    },
  },
  {
    id: "reverse-quote",
    question: { en: "What does Reverse Quote do?", zh: "“反向报价”有什么用？" },
    answer: {
      en: [
        "Enter the TCE you want (Target TCE) and it shows the freight rate that gives it, next to the break-even freight rate, the minimum safe rate and your current rate.",
        "Target TCE and Freight Rate are two ends of one relationship: edit either one and the other follows. Owner Ask is independent. Reset returns to the values from the form.",
      ],
      zh: [
        "输入你想要的日租金（目标 TCE），就能看到达到它所需的运费，同时列出盈亏平衡运费、最低安全运费和当前运费。",
        "目标 TCE 和运费是同一关系的两端：改其中一个，另一个随之变化；船东要价则是独立的。“重置”会回到表单里的数值。",
      ],
    },
  },
  {
    id: "risk",
    question: { en: "How do I read the Risk Analysis table?", zh: "怎样看“风险分析”表？" },
    answer: {
      en: [
        "The first row is the base case. The other four rows each change one thing — port cost, bunker price, margin days, freight rate — by the amount in the Delta column.",
        "Each row shows the resulting TCE, how far it moves from the base case and whether the decision is still GO. You can edit the deltas to test your own what-if.",
      ],
      zh: [
        "第一行是基准情景。其余四行各改变一个因素——港口费用、燃油价格、预留天数、运价——变化量在“变化”一列。",
        "每一行显示变化后的日租金、和基准的差距，以及决策是否仍为 GO。你可以修改变化量，测试自己的假设。",
      ],
    },
  },
  {
    id: "save",
    question: { en: "What is the difference between Save Quote and Save Draft?", zh: "“保存报价”和“保存草稿”有什么区别？" },
    answer: {
      en: [
        "Save Quote stores a finished quote with its verdict. It is available after you have clicked Run on the current inputs, and it stores exactly what you saw.",
        "Save Draft stores your inputs as they are, even if they are incomplete, so you can finish later. Each click creates a new draft.",
      ],
      zh: [
        "“保存报价”会把一份完成的报价连同结论一起存下来。只有在当前输入上点过“航次测算”后才能使用，存下的就是你看到的内容。",
        "“保存草稿”会按现状保存你的输入，即使没填完，方便以后接着做。每点一次都会新建一份草稿。",
      ],
    },
  },
  {
    id: "continue",
    question: { en: "How do I continue an earlier quote or draft?", zh: "怎样接着做之前的报价或草稿？" },
    answer: {
      en: [
        "On the Workspace, use “Start from a previous quote” to search, or “Resume” on the banner that offers your latest draft. In History, click Load on a row or double-click it.",
        "If the form has unsaved changes you are asked before they are replaced.",
      ],
      zh: [
        "在工作区，可以用“从历史报价开始”搜索，或者点击横幅上的“恢复”来继续最近的草稿；在历史记录里，点击某一行的“加载”，或双击该行。",
        "如果表单里有尚未保存的修改，替换之前会先询问你。",
      ],
    },
  },
  {
    id: "bunker",
    question: { en: "Where do the bunker prices and consumption figures come from?", zh: "燃油价格和油耗是从哪里来的？" },
    answer: {
      en: [
        "Choosing a known bunkering port fills the HFO and MGO prices from the latest bunker report and says which report date it used. Entering a vessel DWT fills the typical consumption figures.",
        "Everything filled in this way can still be edited. A port that is not in the list has no lookup, so type the prices yourself.",
      ],
      zh: [
        "选择一个已知的加油港，会用最新的燃油报价填入 HFO 和 MGO 价格，并说明用的是哪一天的报价。输入船舶载重吨后，会填入典型的油耗数据。",
        "这样自动填入的内容仍然可以修改。不在列表里的港口不会自动查询，请自行输入价格。",
      ],
    },
  },
  {
    id: "delete",
    question: { en: "How do I delete records?", zh: "怎样删除记录？" },
    answer: {
      en: [
        "In History, tick the rows (or Select all) and click Delete selected. You are asked to confirm first.",
        "Deleted quotes disappear from History, Search and Excel export; drafts are deleted permanently.",
      ],
      zh: [
        "在历史记录里勾选记录（或“全选”），点击“删除所选”，再确认一次。",
        "被删除的报价会从历史记录、搜索和 Excel 导出中消失；草稿会被永久删除。",
      ],
    },
  },
  {
    id: "loading-time",
    question: { en: "Loading time: days or rate?", zh: "装卸时间：填天数还是填装卸率？" },
    answer: {
      en: [
        "For loading and for discharging you can choose how to give the time: Days (you type the number of days) or Rate (you type how many tons are handled per day).",
        "With a rate, the days are the quantity divided by the rate, rounded like every other day figure. They are calculated when you click Run and shown next to the rate (for example \"= 3.33 days\"), so you can see what was used. The choice is made separately for loading and for discharging.",
      ],
      zh: [
        "装货和卸货都可以选择时间的填法：“天数”（直接输入天数），或“装卸率”（输入每天装卸多少吨）。",
        "选装卸率时，天数 = 货量 ÷ 装卸率，和其他天数一样取到两位小数。它在你点击“航次测算”时计算，并显示在装卸率旁边（例如“= 3.33 天”），让你看到实际用了多少。装货和卸货可以分别选择。",
      ],
    },
  },
  {
    id: "pda",
    question: { en: "Load-port PDA and discharge-port PDA", zh: "装港 PDA 和卸港 PDA" },
    answer: {
      en: [
        "Port costs are entered as two figures, one for the load port and one for the discharge port. Both are needed (enter 0 if there is none) and both count towards the voyage cost.",
        "A quote saved before this was introduced had a single port cost. When you open it, that amount is split evenly between the two ports (the total is unchanged) and a note tells you so — please check the split.",
        "Anything else you pay on the voyage can go under Others: add a name and an amount for each item.",
      ],
      zh: [
        "港口使费分成两个数字填写：装港一个、卸港一个。两个都要填（没有就填 0），都会计入航次成本。",
        "在这之前保存的报价只有一个港口使费。打开它时，这笔钱会平均拆分到两个港口（合计不变），并给出提示，请核对拆分是否合理。",
        "航次中的其他支出可以放在“其他费用”里：每一项填写名称和金额。",
      ],
    },
  },
  {
    id: "enquiry",
    question: { en: "How does “Start from an enquiry” work?", zh: "“从询盘开始”怎么用？" },
    answer: {
      en: [
        "Paste the customer's enquiry into the box at the top and click Recognise fields. The tool looks in the text for the cargo, the charter terms, the ports, the quantity and the laycan. The text is saved together with the quote.",
        "A field you have not filled is filled in with a note “Recognised from the enquiry: … — please check”. If the field already holds something different, the tool shows what it found next to your current value and does not change yours. If nothing is found, your current value is kept and a note says so.",
        "A range (such as 3,000–5,000 mt) or a vague laycan (such as “mid Sep”) is not turned into a number for you: a note asks you to enter a specific figure. Recognition is only a suggestion, so check it before you click Run.",
      ],
      zh: [
        "把客户发来的询盘文字粘贴到最上面的输入框，点“自动识别”。系统会在文字里找货物、租约条款、港口、数量和受载期。这段文字会随报价一起保存。",
        "你还没填的字段会被自动填入，并注明“从询盘中识别到：……——请核对”。如果字段里已经有不同的内容，系统会把识别到的结果显示在当前值旁边，不会改动你填的。如果没有识别到，会保留当前值并给出说明。",
        "区间（比如 3000–5000 吨）或写得模糊的受载期（比如“九月中”）不会替你变成一个数字：系统会提示你自己填一个具体的值。识别结果只是建议，点“航次测算”之前请先核对。",
      ],
    },
  },
  {
    id: "special-passage",
    question: {
      en: "How do I fill in Special Passage (Yangtze estuary, Qiongzhou Strait)?",
      zh: "特殊航段（长江口、琼州海峡）怎么填？",
    },
    answer: {
      en: [
        "The ballast and laden distances are the full port-to-port figures, including any stretch through the Yangtze estuary or the Qiongzhou Strait. In the Special Passage group, enter that stretch's nautical miles under Ballast and/or Laden, and the light-oil consumption (t/day) to use for it.",
        "The miles you enter are taken out of the leg they belong to — Ballast from the ballast distance, Laden from the laden distance — and sailed at that leg's speed. Only light oil is burned there, at the rate you entered. The total sailing time stays the same (apart from rounding).",
        "Most voyages pass a strait once, so fill in only the side that applies and leave the other at 0. A stretch longer than the leg it is taken from is not accepted.",
      ],
      zh: [
        "空驶距离和满载距离填的是港口到港口的全程，已经包含经过长江口或琼州海峡的那一段。在“特殊航段”里，把这一段的海里数填到“空载”和/或“满载”下面，再填这一段用的轻油耗（吨/天）。",
        "你填的海里数会从它所属的那一段航程里扣掉：空载的从空驶距离里扣，满载的从满载距离里扣，并按该段的航速计算天数。这一段只烧轻油，按你填的耗量算。总航行时间不变（取整误差除外）。",
        "大多数航次只经过一次，只填对应的一边，另一边保持 0。海里数超过它所属那一段航程的，系统不接受。",
      ],
    },
  },
  {
    id: "others",
    question: {
      en: "What can I put under Others, and can an amount be negative?",
      zh: "“其他费用”里可以填什么？金额可以是负数吗？",
    },
    answer: {
      en: [
        "Others holds any voyage cost that has no field of its own. Add a row with a name and an amount in USD for each item (up to 20). An untouched row is ignored; a half-filled row (a name without an amount, or the other way round) keeps the form incomplete.",
        "An amount can be negative. A negative amount is a credit: it lowers the total voyage cost and raises the TCE — for example a rebate, or an adjustment to the freight. Every amount goes straight into the total voyage cost.",
      ],
      zh: [
        "“其他费用”用来放没有单独字段的航次成本。每一项添加一行，填名称和美元金额（最多 20 项）。没动过的空行会被忽略；只填了一半的行（有名称没金额，或者反过来）会让表单保持“未填完”。",
        "金额可以是负数。负数相当于抵扣：会降低航次总成本、提高 TCE，比如一笔返还，或者对运费的调整。每一项金额都直接计入航次总成本。",
      ],
    },
  },
  {
    id: "dashboards",
    question: { en: "What do the Dashboards show?", zh: "数据看板都显示什么？" },
    answer: {
      en: [
        "Four charts, each with a drop-down at the top right and a Download button that saves the rows on screen as a CSV file. The slider under a chart zooms the date range. Bunker price history shows the reference prices from the bunker reports, one port at a time. TCE by vessel type, Freight rate by cargo and PDA by port are built from your company's saved quotes, one point per quote.",
        "A quote with no vessel DWT on record appears under “Unknown DWT” instead of in a size band. The freight-rate chart only lists quotes whose cargo matches the standard cargo list.",
        "Some records only have a total freight and no quantity: they show quantity 1 with the total freight as the rate. They are left out of the freight-rate chart, because that “rate” is not a real per-ton rate.",
        "Dashboards are switched on per company. If you cannot open them, please contact us.",
      ],
      zh: [
        "一共四张图，右上角都有下拉选择，还有“下载”按钮，可以把屏幕上的数据保存成 CSV 文件；图下方的滑块可以缩放日期范围。燃油价格历史显示燃油报价的参考价，一次选一个港口。不同船型 TCE 走势、分货种运费走势、分港口 PDA 用的是你们公司保存过的报价，每条报价一个点。",
        "没有记录船舶载重吨的报价会归入“未知吨位”，不会混进某个吨位档。分货种运费走势只列货物能对上标准货物清单的报价。",
        "有些记录只有总运费、没有货量：它们显示货量为 1，单价就是总运费。这类记录不进运费走势图，因为这个“单价”不是真实的单吨运费。",
        "数据看板是按公司开通的功能。如果打不开，请联系我们。",
      ],
    },
  },
  {
    id: "distance",
    question: { en: "How is the voyage distance filled in?", zh: "航次距离是怎么填出来的？" },
    answer: {
      en: [
        "Add the load port, the discharge port and any waypoints under Voyage ports, and the ballast and laden distances are filled in for you: first from your own port-to-port table, then, for a pair that is not in it, from an estimate along the sea route. A note under the field says which source the figure came from.",
        "If a leg has no figure from either, a message names the leg and you enter the distance yourself. You can overwrite any filled distance.",
      ],
      zh: [
        "在“航次港口”里添加装港、卸港和途经港，空驶距离和满载距离就会自动填入：先用你们自己的港到港距离表；表里没有的港口对，再用按海上航线估算的距离。字段下面会注明这个数字用的是哪个来源。",
        "如果某一段两种来源都没有，会提示是哪一段，请自己填距离。自动填入的距离你都可以改。",
      ],
    },
  },
];
