// src/utils/generateReportPdf.js
// สร้างไฟล์ PDF ของหน้า Report จากข้อมูลจริง (ไม่ใช่ print หน้าจอแบบเดิม)
// ใช้ pdfmake + ฟอนต์ Sarabun ที่ตั้งค่าไว้ใน pdfSetup.js

import pdfMake from './pdfSetup'

const BRAND_COLOR = '#1b2a47'
const MUTED_COLOR = '#8e9aab'
const RED_COLOR = '#dc2626'

// จัดกลุ่มชั่วโมงเป็นแถวตาราง 2 คอลัมน์ ให้พอดีหน้ากระดาษ แทนการวาดกราฟแท่ง
// (pdfmake ไม่มีปลั๊กอินกราฟในตัว การทำตารางสรุปชัดเจนและอ่านง่ายกว่าสำหรับเอกสาร)
function buildHourlyTable(chartData) {
  if (!chartData || chartData.length === 0) {
    return { text: 'ไม่มีข้อมูลการตรวจจับในวันที่เลือก', style: 'emptyNote' }
  }

  const rows = chartData.map((d) => [
    { text: d.hour, style: 'tableCell' },
    { text: String(d.count), style: 'tableCellNum' }
  ])

  const half = Math.ceil(rows.length / 2)
  const leftRows = rows.slice(0, half)
  const rightRows = rows.slice(half)

  function makeColumn(rowSet) {
    return {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'ช่วงเวลา', style: 'tableHeader' }, { text: 'จำนวน', style: 'tableHeader' }],
          ...rowSet
        ]
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#e2e8f0',
        paddingTop: () => 4,
        paddingBottom: () => 4
      }
    }
  }

  return {
    columns: [
      makeColumn(leftRows),
      { width: 12, text: '' },
      rightRows.length > 0 ? makeColumn(rightRows) : {}
    ]
  }
}

function buildTopVisitorsTable(topVisitors) {
  if (!topVisitors || topVisitors.length === 0) {
    return { text: 'ไม่มีข้อมูลผู้มาเยือนซ้ำในช่วงที่เลือก', style: 'emptyNote' }
  }

  const body = [
    [
      { text: '#', style: 'tableHeader' },
      { text: 'ป้ายทะเบียน', style: 'tableHeader' },
      { text: 'จังหวัด', style: 'tableHeader' },
      { text: 'จำนวนครั้ง', style: 'tableHeader' }
    ],
    ...topVisitors.map((item, index) => [
      { text: String(index + 1), style: 'tableCell' },
      { text: item.license_plate, style: 'tableCellPlate' },
      { text: item.province, style: 'tableCell' },
      { text: String(item.count), style: 'tableCellNum' }
    ])
  ]

  return {
    table: { widths: [24, '*', '*', 60], body },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#e2e8f0',
      paddingTop: () => 6,
      paddingBottom: () => 6
    }
  }
}

/**
 * สร้าง docDefinition + สั่งดาวน์โหลด PDF ของ Daily Summary Report
 *
 * @param {Object} params
 * @param {Date} params.selectedDate - วันที่กำลังดูรายงานอยู่
 * @param {string} params.dateLabel - วันที่แบบไทย (formatDateThai แล้ว)
 * @param {string} [params.villageName] - ชื่อหมู่บ้าน ('ทุกหมู่บ้าน' ถ้าไม่ระบุ)
 * @param {number} params.totalVehicles
 * @param {string} params.peakHour
 * @param {number} params.blacklistAlerts
 * @param {Array<{hour:string,count:number}>} params.chartData
 * @param {Array<{license_plate:string,province:string,count:number}>} params.topVisitors
 * @param {number} params.topVisitorsDays - จำนวนวันย้อนหลังของตาราง Top Visitors
 */
export function generateReportPdf({
  selectedDate,
  dateLabel,
  villageName = 'ทุกหมู่บ้าน',
  totalVehicles = 0,
  peakHour = '-',
  blacklistAlerts = 0,
  chartData = [],
  topVisitors = [],
  topVisitorsDays = 7
}) {
  const generatedAt = new Date().toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    defaultStyle: {
      font: 'Sarabun',
      fontSize: 10,
      color: '#1b2a47'
    },
    content: [
      { text: 'Daily Summary Report', style: 'title' },
      { text: `หมู่บ้าน: ${villageName}`, style: 'subtitle' },
      { text: `วันที่: ${dateLabel}`, style: 'subtitle', margin: [0, 0, 0, 16] },

      // KPI cards แบบตาราง 3 ช่อง
      {
        columns: [
          {
            width: '*',
            table: {
              widths: ['*'],
              body: [[
                {
                  stack: [
                    { text: 'TOTAL VEHICLES TODAY', style: 'kpiLabel' },
                    { text: String(totalVehicles), style: 'kpiValue' }
                  ],
                  border: [false, false, false, false]
                }
              ]]
            },
            layout: 'noBorders',
            margin: [0, 0, 8, 0]
          },
          {
            width: '*',
            table: {
              widths: ['*'],
              body: [[
                {
                  stack: [
                    { text: 'PEAK HOUR', style: 'kpiLabel' },
                    { text: peakHour, style: 'kpiValue' }
                  ],
                  border: [false, false, false, false]
                }
              ]]
            },
            layout: 'noBorders',
            margin: [8, 0, 8, 0]
          },
          {
            width: '*',
            table: {
              widths: ['*'],
              body: [[
                {
                  stack: [
                    { text: 'BLACKLIST ALERTS', style: 'kpiLabel' },
                    { text: String(blacklistAlerts), style: 'kpiValueRed' }
                  ],
                  border: [false, false, false, false]
                }
              ]]
            },
            layout: 'noBorders',
            margin: [8, 0, 0, 0]
          }
        ],
        margin: [0, 0, 0, 20]
      },

      { text: 'Hourly Vehicle Detections', style: 'sectionTitle' },
      buildHourlyTable(chartData),

      { text: `Top 5 Frequent Visitors (Last ${topVisitorsDays} Days)`, style: 'sectionTitle', margin: [0, 20, 0, 8] },
      buildTopVisitorsTable(topVisitors)
    ],
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `สร้างเมื่อ ${generatedAt}`, style: 'footerText', margin: [40, 0, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, style: 'footerText', alignment: 'right', margin: [0, 0, 40, 0] }
      ]
    }),
    styles: {
      title: { fontSize: 20, bold: true, color: BRAND_COLOR },
      subtitle: { fontSize: 11, color: MUTED_COLOR },
      sectionTitle: { fontSize: 13, bold: true, color: BRAND_COLOR, margin: [0, 0, 0, 8] },
      kpiLabel: { fontSize: 9, bold: true, color: MUTED_COLOR, margin: [0, 0, 0, 4] },
      kpiValue: { fontSize: 22, bold: true, color: BRAND_COLOR },
      kpiValueRed: { fontSize: 22, bold: true, color: RED_COLOR },
      tableHeader: { bold: true, fontSize: 9, color: MUTED_COLOR, fillColor: '#f8fafc' },
      tableCell: { fontSize: 10 },
      tableCellNum: { fontSize: 10, alignment: 'right' },
      tableCellPlate: { fontSize: 10, bold: true },
      emptyNote: { fontSize: 10, color: MUTED_COLOR, italics: true }
    }
  }

  const fileNamePart = selectedDate instanceof Date
    ? selectedDate.toISOString().slice(0, 10)
    : 'report'

  pdfMake.createPdf(docDefinition).download(`daily-report-${fileNamePart}.pdf`)
}
