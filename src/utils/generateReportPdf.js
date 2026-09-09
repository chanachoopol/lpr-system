// src/utils/generateReportPdf.js
// สร้างไฟล์ PDF ของหน้ารายงานสรุปการตรวจจับยานพาหนะ (Print-friendly / Monochrome / 1-Page Compact)
// ใช้ pdfmake + ฟอนต์ Sarabun ที่ตั้งค่าไว้ใน pdfSetup.js

import pdfMake from './pdfSetup'

const TEXT_MAIN = '#111827'     // สีดำเข้ม คมชัด
const TEXT_MUTED = '#4b5563'    // สีเทาเข้ม
const BORDER_COLOR = '#cbd5e1'  // สีเส้นขอบเทา
const BG_HEADER = '#f1f5f9'     // สีพื้นหลังหัวตาราง
const BG_CARD = '#f8fafc'       // สีพื้นหลังการ์ด
const BG_ZEBRA = '#f8fafc'      // สีพื้นหลังแถวสลับ

// ตารางชั่วโมงการตรวจจับ (แบ่ง 2 คอลัมน์ ซ้าย-ขวา ไล่จากบนลงล่าง สมดุลตามจำนวนรายการ)
function buildHourlyTable(chartData) {
  const activeData = (chartData || []).filter((d) => d && d.count > 0)

  if (activeData.length === 0) {
    return {
      text: 'ไม่มีข้อมูลการตรวจจับยานพาหนะในช่วงเวลาที่เลือก',
      style: 'emptyNote'
    }
  }

  const half = Math.ceil(activeData.length / 2)
  const leftRows = activeData.slice(0, half)
  const rightRows = activeData.slice(half)

  function makeColumnTable(rowSet) {
    if (!rowSet || rowSet.length === 0) {
      return { text: '' }
    }

    const body = [
      [
        { text: 'ช่วงเวลา', style: 'tableHeader' },
        { text: 'จำนวน', style: 'tableHeader', alignment: 'right' }
      ],
      ...rowSet.map((d) => [
        { text: d.hour, style: 'tableCell' },
        { text: `${Number(d.count).toLocaleString()} ครั้ง`, style: 'tableCellNum' }
      ])
    ]

    return {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 70],
        body
      },
      layout: {
        hLineWidth: () => 0.4,
        vLineWidth: () => 0,
        hLineColor: () => BORDER_COLOR,
        fillColor: (rowIndex) => {
          if (rowIndex === 0) return BG_HEADER
          return rowIndex % 2 === 0 ? BG_ZEBRA : '#ffffff'
        },
        paddingTop: () => 3,
        paddingBottom: () => 3,
        paddingLeft: () => 6,
        paddingRight: () => 6
      }
    }
  }

  return {
    stack: [
      {
        columns: [
          { width: '*', ...makeColumnTable(leftRows) },
          { width: 14, text: '' },
          { width: '*', ...makeColumnTable(rightRows) }
        ]
      },
      {
        text: '* แสดงเฉพาะช่วงเวลาที่มีการตรวจจับยานพาหนะ',
        style: 'footnote',
        margin: [0, 3, 0, 0]
      }
    ]
  }
}

// ตาราง Top Frequent Visitors (กระชับ ประหยัดพื้นที่แนวตั้ง)
function buildTopVisitorsTable(topVisitors) {
  if (!topVisitors || topVisitors.length === 0) {
    return { text: 'ไม่มีข้อมูลผู้มาเยือนซ้ำในช่วงเวลาที่เลือก', style: 'emptyNote' }
  }

  const body = [
    [
      { text: '#', style: 'tableHeader', alignment: 'center' },
      { text: 'ป้ายทะเบียน', style: 'tableHeader' },
      { text: 'จังหวัด', style: 'tableHeader' },
      { text: 'จำนวนครั้ง', style: 'tableHeader', alignment: 'right' }
    ],
    ...topVisitors.map((item, index) => [
      { text: String(index + 1), style: 'tableCell', alignment: 'center' },
      { text: item.license_plate || '-', style: 'tableCellPlate' },
      { text: item.province || '-', style: 'tableCell' },
      { text: `${Number(item.count).toLocaleString()} ครั้ง`, style: 'tableCellNum' }
    ])
  ]

  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [24, '*', '*', 85],
      body
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0,
      hLineColor: () => BORDER_COLOR,
      fillColor: (rowIndex) => {
        if (rowIndex === 0) return BG_HEADER
        return rowIndex % 2 === 0 ? BG_ZEBRA : '#ffffff'
      },
      paddingTop: () => 3.5,
      paddingBottom: () => 3.5,
      paddingLeft: () => 6,
      paddingRight: () => 6
    }
  }
}

/**
 * สร้าง docDefinition + สั่งดาวน์โหลด PDF รายงานสรุปการตรวจจับยานพาหนะ (พอดี 1 หน้า A4)
 */
export function generateReportPdf({
  selectedDate,
  dateLabel,
  villageName = 'ทุกหมู่บ้าน',
  totalVehicles = 0,
  uniquePlates = 0,
  entryDetections = 0,
  exitDetections = 0,
  whitelistDetections = 0,
  blacklistAlerts = 0,
  peakHour = '-',
  chartData = [],
  topVisitors = [],
  topVisitorsDays = 7,
  topVisitorsHeading = ''
}) {
  const generatedAt = new Date().toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  const visitorsTitle = topVisitorsHeading || `Top Frequent Visitors (Last ${topVisitorsDays} Days)`

  // ฟังก์ชันสร้างการ์ดกล่องขอบมน 3 คอลัมน์ (กว้าง ~165pt, สูง ~35pt)
  function renderMetricCard(label, value, isAlert = false) {
    return {
      stack: [
        {
          canvas: [
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: 165,
              h: 36,
              r: 4,
              lineColor: BORDER_COLOR,
              lineWidth: 0.6,
              color: BG_CARD
            }
          ]
        },
        {
          stack: [
            { text: label, style: 'cardLabel' },
            { text: String(value), style: isAlert ? 'cardValueAlert' : 'cardValue' }
          ],
          relativePosition: { x: 8, y: -31 }
        }
      ]
    }
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [35, 28, 35, 28],
    defaultStyle: {
      font: 'Sarabun',
      fontSize: 9.5,
      color: TEXT_MAIN
    },
    content: [
      // Title Header
      { text: 'Vehicle Detection Summary Report', style: 'title' },
      { text: 'รายงานสรุปการตรวจจับยานพาหนะ', style: 'subtitleThai' },

      // Meta Info Grid
      {
        table: {
          widths: ['auto', '*', 'auto', '*'],
          body: [
            [
              { text: 'โครงการ / หมู่บ้าน:', bold: true, style: 'metaLabel' },
              { text: villageName, style: 'metaValue' },
              { text: 'วันที่พิมพ์เอกสาร:', bold: true, style: 'metaLabel' },
              { text: generatedAt, style: 'metaValue' }
            ],
            [
              { text: 'ช่วงเวลาของรายงาน:', bold: true, style: 'metaLabel' },
              { text: dateLabel, colSpan: 3, style: 'metaValue' },
              {},
              {}
            ]
          ]
        },
        layout: 'noBorders',
        margin: [0, 4, 0, 8]
      },

      // เส้นแบ่งแนวนอน
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 525,
            y2: 0,
            lineWidth: 0.8,
            lineColor: BORDER_COLOR
          }
        ],
        margin: [0, 0, 0, 8]
      },

      // หัวข้อสรุปตัวเลข (ตัดภาษาอังกฤษออก)
      { text: 'สรุปข้อมูลภาพรวม', style: 'sectionTitle' },

      // แถวที่ 1 (3 คอลัมน์)
      {
        columns: [
          { width: '*', ...renderMetricCard('การตรวจจับทั้งหมด', `${Number(totalVehicles).toLocaleString()} ครั้ง`) },
          { width: 10, text: '' },
          { width: '*', ...renderMetricCard('จำนวนรถจริง (ไม่ซ้ำคัน)', `${Number(uniquePlates).toLocaleString()} คัน`) },
          { width: 10, text: '' },
          { width: '*', ...renderMetricCard('รถขาเข้า', `${Number(entryDetections).toLocaleString()} ครั้ง`) }
        ],
        margin: [0, 0, 0, 5]
      },

      // แถวที่ 2 (3 คอลัมน์)
      {
        columns: [
          { width: '*', ...renderMetricCard('รถขาออก', `${Number(exitDetections).toLocaleString()} ครั้ง`) },
          { width: 10, text: '' },
          { width: '*', ...renderMetricCard('รถลูกบ้าน / สมาชิก', `${Number(whitelistDetections).toLocaleString()} ครั้ง`) },
          { width: 10, text: '' },
          {
            width: '*',
            ...renderMetricCard('แจ้งเตือน Blacklist', `${Number(blacklistAlerts).toLocaleString()} ครั้ง`, blacklistAlerts > 0)
          }
        ],
        margin: [0, 0, 0, 5]
      },

      // แถวที่ 3 (3 คอลัมน์: กล่องเดียว + ช่องว่าง 2 ช่อง)
      {
        columns: [
          { width: '*', ...renderMetricCard('ช่วงเวลาหนาแน่นที่สุด', String(peakHour)) },
          { width: 10, text: '' },
          { width: '*', text: '' },
          { width: 10, text: '' },
          { width: '*', text: '' }
        ],
        margin: [0, 0, 0, 10]
      },

      // Section: Hourly Detections
      { text: 'สถิติการตรวจจับรายชั่วโมง', style: 'sectionTitle' },
      buildHourlyTable(chartData),

      // Section: Top Visitors
      { text: visitorsTitle, style: 'sectionTitle', margin: [0, 10, 0, 4] },
      buildTopVisitorsTable(topVisitors)
    ],
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'ระบบอ่านป้ายทะเบียนยานพาหนะอัตโนมัติ (LPR System)', style: 'footerText', margin: [35, 0, 0, 0] },
        { text: `หน้าที่ ${currentPage} จาก ${pageCount} หน้า`, style: 'footerText', alignment: 'right', margin: [0, 0, 35, 0] }
      ]
    }),
    styles: {
      title: { fontSize: 16, bold: true, color: TEXT_MAIN },
      subtitleThai: { fontSize: 11, color: TEXT_MUTED, margin: [0, 0, 0, 2] },
      metaLabel: { fontSize: 9, color: TEXT_MUTED },
      metaValue: { fontSize: 9, color: TEXT_MAIN },
      sectionTitle: { fontSize: 11.5, bold: true, color: TEXT_MAIN, margin: [0, 0, 0, 4] },
      cardLabel: { fontSize: 8.5, bold: true, color: TEXT_MUTED, margin: [0, 0, 0, 1] },
      cardValue: { fontSize: 12.5, bold: true, color: TEXT_MAIN },
      cardValueAlert: { fontSize: 12.5, bold: true, color: '#000000' },
      tableHeader: { bold: true, fontSize: 9.5, color: TEXT_MAIN, fillColor: BG_HEADER },
      tableCell: { fontSize: 9.5, color: TEXT_MAIN },
      tableCellNum: { fontSize: 9.5, alignment: 'right', color: TEXT_MAIN },
      tableCellPlate: { fontSize: 9.5, bold: true, color: TEXT_MAIN },
      emptyNote: { fontSize: 9, color: TEXT_MUTED, italics: true, margin: [0, 2, 0, 4] },
      footnote: { fontSize: 8, color: TEXT_MUTED, italics: true },
      footerText: { fontSize: 8, color: TEXT_MUTED }
    }
  }

  const fileNamePart = selectedDate instanceof Date
    ? selectedDate.toISOString().slice(0, 10)
    : 'report'

  pdfMake.createPdf(docDefinition).download(`vehicle-summary-report-${fileNamePart}.pdf`)
}
