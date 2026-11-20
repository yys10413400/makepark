// tools/build_teachers.py 가 만듦. 칸: [x, y, 너비, 높이, 발x, 발y, 다리 시작 y(칸 안), 두 다리 사이 틈 있음(1/0)], 몸 키 300px 기준
window.MP_TEACHER_SPRITES = {
 "bear": {
  "name": "곰 선생님",
  "src": "assets/teachers/bear.webp",
  "views": {
   "down": [
    4,
    4,
    170,
    300,
    84.5,
    300,
    258,
    1
   ],
   "right": [
    360,
    4,
    152,
    301,
    78.0,
    301,
    259,
    0
   ],
   "up": [
    182,
    4,
    170,
    300,
    85.0,
    300,
    258,
    1
   ]
  }
 },
 "fox": {
  "name": "여우 선생님",
  "src": "assets/teachers/fox.webp",
  "views": {
   "down": [
    4,
    4,
    162,
    300,
    93.0,
    300,
    271,
    1
   ],
   "right": [
    359,
    4,
    192,
    300,
    114.0,
    300,
    271,
    0
   ],
   "up": [
    174,
    4,
    177,
    300,
    79.0,
    300,
    245,
    0
   ]
  }
 },
 "hedgehog": {
  "name": "고슴도치 선생님",
  "src": "assets/teachers/hedgehog.webp",
  "views": {
   "down": [
    4,
    4,
    185,
    300,
    92.0,
    300,
    255,
    1
   ],
   "right": [
    391,
    4,
    194,
    299,
    87.0,
    299,
    254,
    0
   ],
   "up": [
    197,
    4,
    186,
    300,
    92.0,
    300,
    265,
    1
   ]
  }
 },
 "rabbit": {
  "name": "토끼 선생님",
  "src": "assets/teachers/rabbit.webp",
  "views": {
   "down": [
    4,
    4,
    138,
    300,
    69.0,
    300,
    273,
    1
   ],
   "right": [
    296,
    4,
    115,
    300,
    61.0,
    300,
    273,
    0
   ],
   "up": [
    150,
    4,
    138,
    300,
    68.0,
    300,
    272,
    1
   ]
  }
 },
 "raccoon": {
  "anim": {
   "frames": 13,
   "ms": 100,
   "rowH": 330,
   "src": "assets/teachers/raccoon-anim.webp",
   "views": {
    "down": [
     4,
     4,
     196,
     320,
     95.0,
     320
    ],
    "right": [
     417,
     4,
     226,
     322,
     149.0,
     322
    ],
    "up": [
     208,
     4,
     201,
     320,
     105.0,
     320
    ]
   }
  },
  "name": "너구리 선생님",
  "src": "assets/teachers/raccoon.webp",
  "views": {
   "down": [
    4,
    4,
    189,
    300,
    94.0,
    300,
    271,
    1
   ],
   "right": [
    398,
    4,
    210,
    301,
    135.0,
    301,
    272,
    0
   ],
   "up": [
    201,
    4,
    189,
    300,
    94.0,
    300,
    282,
    1
   ]
  },
  "walk": {
   "src": "assets/teachers/raccoon-walk.webp",
   "views": {
    "down": [
     4,
     4,
     192,
     310,
     94.0,
     310,
     267,
     1
    ],
    "right": [
     402,
     4,
     221,
     311,
     145.0,
     311,
     268,
     0
    ],
    "up": [
     204,
     4,
     190,
     308,
     94.0,
     308,
     277,
     1
    ]
   }
  }
 },
 "sheep": {
  "name": "양 선생님",
  "src": "assets/teachers/sheep.webp",
  "views": {
   "down": [
    4,
    4,
    186,
    300,
    92.0,
    300,
    266,
    1
   ],
   "right": [
    392,
    4,
    153,
    299,
    76.0,
    299,
    265,
    0
   ],
   "up": [
    198,
    4,
    186,
    300,
    92.0,
    300,
    259,
    1
   ]
  }
 }
};
window.MP_TEACHER_VER = '20261120093920';
