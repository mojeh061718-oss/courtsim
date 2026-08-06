/* Court-transcript PDF: the same paginated lines as the .txt, typeset the way
 * a certified transcript actually looks — Courier, 25 numbered lines to the
 * page, double vertical rule on the left, single on the right, page numbers
 * top right. Streams to a Buffer; a full trial lands well under 200 KB. */

import PDFDocument from 'pdfkit';

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 50;
const RULE_LEFT_A = 72; // outer of the double left rule
const RULE_LEFT_B = 76;
const RULE_RIGHT = 560;
const NUM_X = 50; // line numbers, right-aligned to the left rail
const TEXT_X = 86;
const LINE_H = (PAGE.height - MARGIN_TOP - MARGIN_BOTTOM - 24) / 25; // 25 lines/page

export function renderTranscriptPdf(pages, state, caseFile) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0, bufferPages: false, info: { Title: `${caseFile.title} — Transcript of Proceedings`, Author: 'CourtSim (simulated proceeding)' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const shortTitle = caseFile.title.length > 58 ? caseFile.title.slice(0, 55) + '…' : caseFile.title;

    pages.forEach((page, idx) => {
      if (idx > 0) doc.addPage({ size: [PAGE.width, PAGE.height], margin: 0 });
      const pageNo = idx + 1;

      // Frame rules — the signature look of a certified transcript.
      doc.save();
      doc.lineWidth(0.8).strokeColor('#333');
      doc.moveTo(RULE_LEFT_A, MARGIN_TOP - 8).lineTo(RULE_LEFT_A, PAGE.height - MARGIN_BOTTOM + 8).stroke();
      doc.moveTo(RULE_LEFT_B, MARGIN_TOP - 8).lineTo(RULE_LEFT_B, PAGE.height - MARGIN_BOTTOM + 8).stroke();
      doc.moveTo(RULE_RIGHT, MARGIN_TOP - 8).lineTo(RULE_RIGHT, PAGE.height - MARGIN_BOTTOM + 8).stroke();
      doc.restore();

      // Header: short case title left, page number right.
      doc.font('Courier').fontSize(8).fillColor('#666');
      doc.text(shortTitle, TEXT_X, MARGIN_TOP - 24, { lineBreak: false });
      doc.font('Courier-Bold').fontSize(9).fillColor('#222');
      doc.text(String(pageNo), RULE_RIGHT - 40, MARGIN_TOP - 24, { width: 40, align: 'right', lineBreak: false });

      // Body: pages[] carry a right-padded page-number line then a blank —
      // both replaced by the real header above.
      const content = page.slice(2);
      let y = MARGIN_TOP + 12;
      let lineNo = 0;
      for (const raw of content) {
        lineNo += 1;
        // Line number in the rail (skip on fully blank lines for cleanliness).
        doc.font('Courier').fontSize(8).fillColor('#999');
        doc.text(String(lineNo), NUM_X - 22, y + 1, { width: 20, align: 'right', lineBreak: false });
        // Content lines arrive as "NN  body" from the text paginator — the
        // rail renders the number, so strip the textual prefix.
        const line = String(raw).slice(4);
        if (line.trim()) {
          // Lines arrive pre-formatted (indents, centering) — Courier keeps
          // the alignment exactly as the .txt renders it.
          doc.font('Courier').fontSize(10).fillColor('#111');
          doc.text(line.replace(/\s+$/, ''), TEXT_X, y, { lineBreak: false, width: RULE_RIGHT - TEXT_X - 6 });
        }
        y += LINE_H;
        if (lineNo >= 25) break;
      }
    });

    doc.end();
  });
}
