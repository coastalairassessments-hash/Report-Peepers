// Fixed template. All case material arrives as files (plan.json, source.pdf); nothing is spliced into this text.
#let plan = json("plan.json")
#let ink = rgb("#c4161c")
#let hand(body, size) = text(font: "Caveat", weight: 500, size: size, fill: ink, body)
#let L = plan.labels
#let st = plan.style

#set document(title: "Report with margin notes and " + lower(plan.summary.title), author: "Report Peepers")
#set text(lang: "en", font: "Libertinus Serif", size: 11pt)

// ---- the customer's own pages, marked in red ink ----
#for pg in plan.pages [
  #[
    #set page(width: pg.width_pt * 1pt, height: pg.height_pt * 1pt, margin: 0pt)
    #image("source.pdf", page: pg.index, width: pg.width_pt * 1pt, height: pg.height_pt * 1pt, alt: "Page " + str(pg.index) + " of the report as supplied")
    #let W = pg.width_pt * 1pt
    #let H = pg.height_pt * 1pt
    #let d = st.tag_diameter_pt * 1pt
    #for m in pg.marks [
      #let x0 = m.box.at(0) * W
      #let y0 = m.box.at(1) * H
      #let w = (m.box.at(2) - m.box.at(0)) * W
      #let h = (m.box.at(3) - m.box.at(1)) * H
      #pdf.artifact[
        #if m.kind == "circle" {
          place(top + left, dx: x0 - 3pt, dy: y0 - h * 0.08, rotate((calc.rem(m.number, 3) - 1) * 0.5deg, rect(width: w + 6pt, height: h * 1.16, radius: calc.min(h * 0.58, 12pt), stroke: 1.3pt + ink)))
        } else if m.kind == "underline" {
          place(top + left, dx: x0, dy: y0 + h + 1.5pt, line(length: w, stroke: 1.4pt + ink))
        } else {
          place(top + left, dx: x0 - 4pt, dy: y0, rect(width: 4pt, height: h, stroke: (left: 1.3pt + ink, top: 1.3pt + ink, bottom: 1.3pt + ink)))
          place(top + left, dx: x0 + w, dy: y0, rect(width: 4pt, height: h, stroke: (right: 1.3pt + ink, top: 1.3pt + ink, bottom: 1.3pt + ink)))
        }
        #place(top + left, dx: x0 - d - 1pt, dy: y0 - d * 0.35, box(width: d, height: d, align(right + horizon, hand(str(m.number), d * 0.95))))
      ]
    ]
    #for n in pg.notes [
      #let x0 = n.box.at(0) * W
      #let y0 = n.box.at(1) * H
      #place(top + left, dx: x0, dy: y0, box(width: (n.box.at(2) - n.box.at(0)) * W, height: (n.box.at(3) - n.box.at(1)) * H, inset: st.note_pad_pt * 1pt, {
        set par(leading: (st.note_line_height_em - 1) * 1em * 0.6, justify: false)
        hand(if n.number == none { n.text } else { str(n.number) + ". " + n.text }, st.note_font_pt * 1pt)
      }))
    ]
  ]
]

// ---- the typed closing pages ----
#[
  #set page(width: 612pt, height: 792pt, margin: 54pt)
  #set par(justify: false, leading: 0.6em)
  #show heading: set text(weight: "bold")
  #heading(level: 1)[#plan.summary.title]
  #if plan.summary.items_to_clarify_statement != none [#plan.summary.items_to_clarify_statement]
  #if plan.summary.leading_questions.len() > 0 [
    #heading(level: 2)[#L.questions_heading]
    #enum(..plan.summary.leading_questions.map(q => [#q]))
  ]
  #for g in plan.summary.groups [
    #heading(level: 2)[#g.heading]
    #table(columns: (auto, 1fr, auto, auto, 1.2fr), stroke: (x, y) => if y == 0 { (bottom: 0.8pt) } else { (bottom: 0.3pt + luma(190)) }, inset: (x: 4pt, y: 5pt), align: left + top,
      table.header([*#L.column_number*], [*#L.column_item*], [*#L.column_page*], [*#L.column_strength*], [*#L.column_next*]),
      ..g.items.map(i => (
        [#i.number], [#i.title],
        [#if i.page == none [—] else [#i.page#if i.label != none and i.label != str(i.page) [ (printed #i.label)]]],
        [#i.strength], [#if i.next_step == none [—] else [#i.next_step]],
      )).flatten()
    )
  ]
  #if plan.summary.limits.len() > 0 [
    #heading(level: 2)[#L.limits_heading]
    #for x in plan.summary.limits [- #x]
  ]
  #v(1em)
  #text(size: 9.5pt, plan.summary.method_statement)
]

#if plan.overflow.len() > 0 [
  #[
    #set page(width: 612pt, height: 792pt, margin: 54pt)
    #heading(level: 1)[#L.notes_sheet_title]
    #for o in plan.overflow [
      #block(breakable: false, below: 1em)[
        #hand(str(o.number) + ".", 15pt) #h(0.3em) #hand(o.text, 15pt)
        #if o.page != none [ #text(size: 9pt, fill: luma(90))[(report page #o.page)]]
      ]
    ]
  ]
]
