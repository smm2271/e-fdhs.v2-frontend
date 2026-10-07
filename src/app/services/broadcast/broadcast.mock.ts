import { Broadcast, BroadcastUser } from './broadcast.types';

// A reproducible UI scenario; the clock and data source can be replaced independently.
export const MOCK_NOW = '2026-10-07T15:00:00+08:00';
export const MOCK_USERS: BroadcastUser[] = [
  { id: 'student-1', name: '林同學', role: '資訊股長', canConfirm: true, canReply: true },
  { id: 'student-2', name: '陳同學', role: '班代表', canConfirm: true, canReply: true },
  { id: 'student-3', name: '王同學', role: '一般學生', canConfirm: false, canReply: false },
];

export function createMockBroadcasts(): Broadcast[] {
  return [
    {
      id: 'today-1',
      senderName: '張老師',
      sentAt: '2026-10-07T14:32:00+08:00',
      content: '請資訊股長於今天放學前確認教室電腦與投影設備已關閉，謝謝。',
      confirmationDueAt: '2026-10-07T17:00:00+08:00',
      confirmation: null,
      replies: [],
    },
    {
      id: 'today-2',
      senderName: '李老師',
      sentAt: '2026-10-07T10:15:00+08:00',
      content:
        '本週五第六節將進行校園防災演練，請各班先閱讀以下注意事項。\n\n聽到廣播後，請依導師指示攜帶防災頭套，沿指定路線前往操場集合。行進時保持隊伍，不奔跑、不推擠，並協助需要幫忙的同學。\n\n班代表請於集合後清點人數，向導師回報。若有同學因公差或身體不適無法參加，請提前告知。遇到下雨則改於教室進行，最新安排會透過校園文字廣播通知。',
      confirmationDueAt: '2026-10-07T12:00:00+08:00',
      confirmation: {
        confirmedAt: '2026-10-07T11:00:00+08:00',
        confirmedBy: '林同學',
        role: '資訊股長',
      },
      replies: [
        {
          id: 'r1',
          authorName: '林同學 · 資訊股長',
          createdAt: '2026-10-07T11:01:00+08:00',
          content: '已將注意事項轉達給全班。',
          replies: [
            {
              id: 'r2',
              authorName: '李老師',
              createdAt: '2026-10-07T11:10:00+08:00',
              content: '謝謝，請再提醒集合位置在操場東側。',
              replies: [
                {
                  id: 'r3',
                  authorName: '陳同學 · 班代表',
                  createdAt: '2026-10-07T11:20:00+08:00',
                  content: '收到，已補充集合位置。',
                  replies: [],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'yesterday-1',
      senderName: '王老師',
      sentAt: '2026-10-06T15:40:00+08:00',
      content:
        '請班代表確認明日班會的討論題目，並提醒同學準備一項改善校園環境的提案。\n\n提案可以從教室、走廊或午餐時間的觀察出發，描述問題與可行的改善方式即可。',
      confirmationDueAt: '2026-10-07T09:00:00+08:00',
      confirmation: null,
      replies: [
        {
          id: 'r4',
          authorName: '王老師',
          createdAt: '2026-10-06T16:00:00+08:00',
          content: '每組準備一份提案即可。',
          replies: [],
        },
      ],
    },
    {
      id: 'monday-1',
      senderName: '陳老師',
      sentAt: '2026-10-05T13:10:00+08:00',
      content: '圖書館本週新增閱讀專區，歡迎同學利用午休時間前往。',
      confirmationDueAt: '2026-10-05T16:00:00+08:00',
      confirmation: {
        confirmedAt: '2026-10-06T08:00:00+08:00',
        confirmedBy: '陳同學',
        role: '班代表',
      },
      replies: [],
    },
    {
      id: 'monday-2',
      senderName: '張老師',
      sentAt: '2026-10-05T08:20:00+08:00',
      content: '本週值日生名單已公告，請班代表協助提醒。',
      confirmationDueAt: '2026-10-05T12:00:00+08:00',
      confirmation: {
        confirmedAt: '2026-10-05T09:00:00+08:00',
        confirmedBy: '陳同學',
        role: '班代表',
      },
      replies: [],
    },
    {
      id: 'last-week',
      senderName: '張老師',
      sentAt: '2026-10-02T08:00:00+08:00',
      content: '上週未確認的歷史廣播，不列入本週 Feed 與導覽提示。',
      confirmationDueAt: '2026-10-02T12:00:00+08:00',
      confirmation: null,
      replies: [],
    },
  ];
}
