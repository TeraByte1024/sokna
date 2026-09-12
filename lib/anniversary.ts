/**
 * 40주년 기념 공연 단일 참조 설정 (Single Source of Truth)
 * 
 * 공연 정보(일시, 장소, 타임테이블, 사진 아카이브 등)와
 * 페이지 내 텍스트 설명(헤더, 안내 문구, 구글 폼 링크, 유의사항 등)을 
 * 코드 상에서 쉽게 수정할 수 있도록 관리하는 설정 파일입니다.
 */

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

export interface HeroPhoto {
  url: string;
  caption: string;
}

export interface AnniversaryConfig {
  // ─── 1. 단체 및 메타 정보 ───
  clubName: string;
  clubDescription: string;
  establishedYear: number;
  anniversaryYear: number;
  metadata: {
    title: string;
    description: string;
  };

  // ─── 2. 메인 홈(랜딩) 40주년 배너 문구 ───
  landingBanner: {
    badge: string;
    title: string;
    description: string;
    buttonText: string;
  };

  // ─── 3. 히어로 섹션 ───
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    countdownLabel: string;
    ctaAttendanceText: string;
    ctaScheduleText: string;
  };

  // ─── 4. 공연 비주얼 쇼케이스 ───
  showcase: {
    badge: string;
    title: string;
    description: string;
  };
  heroPhotos: HeroPhoto[];

  // ─── 5. 행사 일시, 장소 및 교통 안내 ───
  eventDate: string; // ISO 8601 (카운트다운 기준 일시)
  eventDateDisplay: string;
  receptionTimeDisplay: string;
  venue: {
    name: string;
    address: string;
    subway: string;
    parking: string;
    mapUrl: string;
  };
  contact: {
    phone: string;
    email: string;
    kakaoOpenChat: string;
  };
  scheduleSection: {
    badge: string;
    title: string;
    dateLabel: string;
    venueLabel: string;
    subwayLabel: string;
    parkingLabel: string;
    mapButtonText: string;
    timetableTitle: string;
  };
  timetables: TimetableItem[];

  // ─── 6. 40년 발자취 사진 아카이브 ───
  archiveSection: {
    badge: string;
    title: string;
    description: string;
    historyButtonText: string;
    photosButtonText: string;
  };
  archivePhotos: ArchivePhoto[];

  // ─── 7. 구글 폼 참석 신청 (RSVP) ───
  rsvp: {
    badge: string;
    title: string;
    description: string;
    /** 구글 폼 신청 URL (실제 폼 링크로 교체하여 사용) */
    googleFormUrl: string;
    buttonText: string;
    subText: string;
    noticeTitle: string;
    notices: string[];
    contactInquiryText: string;
  };

  // ─── 8. 푸터 및 카피라이트 ───
  footer: {
    slogan: string;
    copyright: string;
  };
}

export const ANNIVERSARY_CONFIG: AnniversaryConfig = {
  // ─── 1. 단체 및 메타 정보 ───
  clubName: "소리로 크는 나무 (소크나)",
  clubDescription: "한양대학교 X 한양여자대학교 연합 밴드 동아리",
  establishedYear: 1986,
  anniversaryYear: 2026,
  metadata: {
    title: "40주년 기념 공연",
    description:
      "소리로 크는 나무(소크나) 40주년 기념 공연 안내 및 참석 신청 — 한양대학교 X 한양여자대학교 연합 밴드 동아리",
  },

  // ─── 2. 메인 홈(랜딩) 40주년 배너 문구 ───
  landingBanner: {
    badge: "40th Anniversary · 1986 — 2026",
    title: "소리로 크는 나무 40주년 기념 공연",
    description: "40년의 울림을 함께할 소크나인의 참석을 기다립니다",
    buttonText: "40주년 행사 바로가기",
  },

  // ─── 3. 히어로 섹션 ───
  hero: {
    badge: "40th Anniversary · 1986 — 2026",
    title: "소리로 크는 나무 40주년 기념 공연",
    subtitle: "마흔 번의 울림, 청춘을 관통한 소리의 숲 (1986 - 2026)",
    countdownLabel: "D-Day Countdown",
    ctaAttendanceText: "참석 신청하기",
    ctaScheduleText: "행사 일정 보기",
  },

  // ─── 4. 공연 비주얼 쇼케이스 ───
  showcase: {
    badge: "Performance Showcase",
    title: "40년의 열정을 무대에 담다",
    description:
      "한양대학교와 한양여자대학교에서 뜨겁게 울려 퍼진 소크나의 사운드. 40년간 이어진 합주실의 밤과 무대 위의 전율을 사진으로 돌아봅니다.",
  },
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

  // ─── 5. 행사 일시, 장소 및 교통 안내 ───
  eventDate: "2026-11-07T17:00:00+09:00", // 2026년 11월 7일 토요일 17:00
  eventDateDisplay: "2026년 11월 7일 (토) 오후 5:00",
  receptionTimeDisplay: "접수 시작: 오후 4:30 ~",
  venue: {
    name: "한양대학교 백남음악관 콘서트홀",
    address: "서울특별시 성동구 왕십리로 222 (행당동)",
    subway: "한양대역 (2호선) 2번 출구 도보 3분 / 왕십리역 6번 출구",
    parking: "교내 주차장 이용 가능 (참석자 할인 주차권 제공)",
    mapUrl:
      "https://map.naver.com/v5/search/%ED%95%9c%EC%96%91%EB%8c%80%ED%95%99%EA%B5%90%20%EB%B0%B1%EB%82%A8%EC%9D%8C%EC%95%85%EA%B4%80",
  },
  contact: {
    phone: "010-0000-0000",
    email: "sokna40th@gmail.com",
    kakaoOpenChat: "https://open.kakao.com/",
  },
  scheduleSection: {
    badge: "Schedule & Venue",
    title: "행사 안내",
    dateLabel: "일시",
    venueLabel: "장소",
    subwayLabel: "대중교통",
    parkingLabel: "주차",
    mapButtonText: "네이버 지도에서 보기",
    timetableTitle: "프로그램 순서",
  },
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
      description: "개회사, 40주년 특별 영상 상영, 역대 회장단 공로 헌정 및 축사",
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
      description:
        "역대 기수 OB 및 재학생 YB 연합 밴드 스테이지, 40주년 전체 앙코르 및 단체 사진 촬영",
    },
  ],

  // ─── 6. 40년 발자취 사진 아카이브 ───
  archiveSection: {
    badge: "Archive Gallery",
    title: "40년의 발자취",
    description:
      "1986년 창립부터 지금 이 순간까지, 소크나가 걸어온 40년의 시간을 사진으로 되돌아봅니다.",
    historyButtonText: "동아리 전체 역사 보기",
    photosButtonText: "사진 갤러리 전체 보기",
  },
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
  ],

  // ─── 7. 구글 폼 참석 신청 (RSVP) ───
  rsvp: {
    badge: "RSVP & Registration",
    title: "40주년 기념 공연 참석 신청",
    description:
      "40년의 울림을 함께 만들어갈 소크나 동문 여러분을 모십니다. 원활한 좌석 배치 및 기념품 준비를 위해 아래 구글 폼을 통해 참석 여부를 등록해 주세요.",
    // 구글 폼 URL (필요 시 실제 구글 폼 링크로 교체)
    googleFormUrl: "https://forms.gle/sokna40thAnniversary",
    buttonText: "구글 폼으로 참석 신청하기",
    subText: "※ 신청 링크를 클릭하면 공식 참석 설문 구글 폼으로 이동합니다.",
    noticeTitle: "참석 안내 및 유의사항",
    notices: [
      "재학생(YB) 및 역대 졸업생(OB) 동문 누구나 신청 가능합니다.",
      "동반인(가족, 지인 등)이 있으신 경우 설문 내 동반 인원수를 기재해 주세요.",
      "기념 팜플렛, 40주년 굿즈 및 만찬 좌석이 사전 신청자 기준으로 준비됩니다.",
      "참석 여부가 변경되거나 추가 문의가 있으실 경우 아래 오픈채팅 또는 연락처로 알려주세요.",
    ],
    contactInquiryText: "문의사항이 있으신가요? 카카오톡 오픈채팅 또는 담당자에게 연락 주세요.",
  },

  // ─── 8. 푸터 및 카피라이트 ───
  footer: {
    slogan: "소리로 크는 나무, 40년의 울림",
    copyright: "© 2026 소크나 (SOKNA). All Rights Reserved.",
  },
};
