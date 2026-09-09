export interface TimetableItem {
  time: string;
  title: string;
  category: "ceremony" | "performance" | "reception" | "break";
  description: string;
}

export interface ArchivePhoto {
  id: string;
  url: string;
  title: string;
  era: string;
  caption: string;
}

export const ANNIVERSARY_CONFIG = {
  // 공식 단체명
  clubDescription: "한양대학교 X 한양여자대학교 연합 밴드 동아리",
  
  // 공연 제목 및 부제
  concertTitle: "소리로 크는 나무 40주년 기념 공연",
  concertSubtitle: "마흔 번의 울림, 청춘을 관통한 소리의 숲 (1986 - 2026)",
  
  // 행사 일시 및 장소
  establishedYear: 1986,
  anniversaryYear: 2026,
  eventDate: "2026-11-07T17:00:00+09:00", // 2026년 11월 7일 토요일 17:00
  eventDateDisplay: "2026년 11월 7일 (토) 오후 5:00",
  venue: {
    name: "한양대학교 백남음악관 콘서트홀",
    address: "서울특별시 성동구 왕십리로 222 (행당동)",
    subway: "한양대역 (2호선) 2번 출구 도보 3분 / 왕십리역 6번 출구",
    parking: "교내 주차장 이용 가능 (참석자 할인 주차권 제공)",
    mapUrl: "https://map.naver.com/v5/search/%ED%95%9c%EC%96%91%EB%8c%80%ED%95%99%EA%B5%90%20%EB%B0%B1%EB%82%A8%EC%9D%8C%EC%95%85%EA%B4%80",
  },
  contact: {
    phone: "010-0000-0000",
    email: "sokna40th@gmail.com",
    kakaoOpenChat: "https://open.kakao.com/",
  },

  // 1부, 2부 타임테이블 (3부 제외)
  timetables: [
    {
      time: "16:30 - 17:00",
      title: "동문 접수 & 웰컴 포토존",
      category: "reception",
      description: "기념 팜플렛 및 명찰 수령, 40주년 포토월 기념 촬영",
    },
    {
      time: "17:00 - 17:50",
      title: "1부: 40주년 기념식 및 소크나 40년사 헌정",
      category: "ceremony",
      description: "개회사, 40주년 기념 특별 영상 상영, 역대 회장단 공로 헌정 및 축사",
    },
    {
      time: "17:50 - 18:10",
      title: "인터미션 & 동문 교류",
      category: "break",
      description: "기수별 만남 및 휴식",
    },
    {
      time: "18:10 - 20:30",
      title: "2부: 40주년 기념 특별 연합 콘서트 & 피날레",
      category: "performance",
      description: "역대 기수 OB 및 재학생 YB 연합 밴드 스테이지, 40주년 전체 앙코르 및 단체 사진 촬영",
    },
  ] as TimetableItem[],

  // 비주얼 사진 아카이브 에셋 (고화질 밴드/공연/합주 더미 이미지 컬렉션)
  heroPhotos: [
    {
      url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=1600",
      caption: "무대 위에서 폭발하는 40년의 열정",
    },
    {
      url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1600",
      caption: "앰프를 타고 흐르는 사운드",
    },
    {
      url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1600",
      caption: "관객과 호흡하는 전율의 순간",
    },
  ],

  archivePhotos: [
    {
      id: "photo-1",
      url: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?q=80&w=1000",
      title: "열정의 합주실",
      era: "1980s - 1990s",
      caption: "창립 초기부터 이어져 온 밤샘 합주와 세션의 기록",
    },
    {
      id: "photo-2",
      url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1000",
      title: "정기 콘서트 라이브",
      era: "2000s",
      caption: "무대를 가득 채운 관객들의 환호와 기타 솔로",
    },
    {
      id: "photo-3",
      url: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?q=80&w=1000",
      title: "캠퍼스 노천극장 야외 공연",
      era: "2010s",
      caption: "한양의 밤하늘을 수놓았던 야외 락 페스티벌",
    },
    {
      id: "photo-4",
      url: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=1000",
      title: "새로운 세대의 도약",
      era: "2020s - Present",
      caption: "YB 부원들의 신선한 사운드와 세대 간의 하모니",
    },
    {
      id: "photo-5",
      url: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=1000",
      title: "음악으로 맺은 평생의 인연",
      era: "Community",
      caption: "선후배가 함께 웃고 호흡하는 소크나인의 끈끈한 결속",
    },
    {
      id: "photo-6",
      url: "https://images.unsplash.com/photo-1485579149621-3123dd979885?q=80&w=1000",
      title: "백스테이지와 조율",
      era: "Backstage",
      caption: "공연 직전 마지막 튜닝과 서로를 격려하는 눈빛",
    },
  ] as ArchivePhoto[],
} as const;
