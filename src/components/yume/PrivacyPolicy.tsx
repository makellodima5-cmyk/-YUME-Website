import { useYumePreferences } from "@/data/preferences";

const POLICY_DATE_RU = "31 октября 2026 года";
const POLICY_DATE_EN = "October 31, 2026";
const POLICY_URL = "https://yume-website.yumesupport833.workers.dev/?section=privacy-policy";

type PolicySection = { title: string; paragraphs: string[] };

const POLICY_RU: PolicySection[] = [
{title:"1. Общие положения",paragraphs:[
"Настоящая Политика конфиденциальности описывает, какие сведения YUME получает и использует при посещении сайта, создании и использовании аккаунта, а также при работе с функциями сервиса.",
"Сайт YUME доступен по адресу https://yume-website.yumesupport833.workers.dev/. Используя сайт, пользователь может просматривать каталог, сохранять выбранные произведения, пользоваться личным аккаунтом и другими доступными функциями.",
"Политика относится к данным, которые пользователь предоставляет сам, которые передаются при использовании аккаунта и которые технически возникают при обращении к сайту. Встроенные внешние сервисы могут самостоятельно обрабатывать данные в рамках своей работы.",
"YUME не запрашивает у пользователя пароль от Telegram, данные банковских карт или платёжные реквизиты. Регистрация и вход в аккаунт выполняются через Telegram."
]},
{title:"2. Какие данные обрабатываются",paragraphs:[
"Данные аккаунта. При авторизации через Telegram YUME может получать Telegram ID, имя и фамилию, имя пользователя (username), язык интерфейса и другие сведения профиля, если Telegram передаёт их в рамках авторизации. Эти данные используются для распознавания аккаунта и предоставления его функций.",
"Данные сессии. Для поддержания входа могут использоваться технические сведения сессии и данные, позволяющие подтвердить, что пользователь авторизован. Они нужны для работы аккаунта и защиты доступа к нему.",
"Данные о действиях на сайте. В зависимости от используемых функций могут сохраняться списки «Избранное» и «Буду смотреть», история просмотра, настройки уведомлений и другие выбранные пользователем параметры.",
"Технические данные. При обращении к сайту автоматически передаются технические сведения, необходимые для доставки страниц и работы сервиса. Они могут включать IP-адрес, дату и время запроса, адрес запрошенной страницы, тип и версию браузера, сведения об устройстве и операционной системе, язык браузера, технические идентификаторы и сведения об ошибках.",
"Cookie-файлы и аналогичные технологии. Они могут использоваться для сохранения выбора пользователя, поддержания сессии, запоминания настроек и работы функций сайта. Подробности выбора приведены в разделе 3.",
"YUME не собирает платёжные данные и не принимает оплату на сайте. Для создания аккаунта не требуется указывать адрес электронной почты. Пользовательские оценки и комментарии не запрашиваются."
]},
{title:"3. Для чего используются данные и как работает выбор cookie",paragraphs:[
"Данные используются для предоставления доступа к сайту и аккаунту, сохранения избранного и списка просмотра, отображения истории, работы настроек уведомлений, поддержания пользовательской сессии, защиты сайта, предотвращения злоупотреблений, поиска и устранения технических ошибок, а также ответа на обращения в поддержку.",
"При первом посещении сайта показывается уведомление с двумя вариантами выбора. Кнопка «Соглашаюсь на использование всех» сохраняет согласие на использование предусмотренных сайтом cookie-файлов и необязательных технологий. Кнопка «Отклонить все» сохраняет отказ: необязательные cookie-файлы и аналогичные технологии не должны включаться.",
"При отказе YUME не запускает необязательные технологии, для которых требуется согласие. При этом сам факт обращения к сайту технически требует передачи минимальных данных запроса, а необходимые для запрошенных пользователем функций данные сессии могут продолжать использоваться. Отказ от необязательных cookie не может отменить передачу IP-адреса и других технических сведений, необходимых для доставки интернет-запроса.",
"Выбор сохраняется в браузере, чтобы баннер не появлялся при каждом посещении. Изменить его можно в любое время с помощью ссылки «Изменить выбор cookie» на странице этой Политики. Пользователь также может удалить cookie-файлы и локальные данные через настройки своего браузера, однако после этого отдельные настройки и функции могут сброситься."
]},
{title:"4. Передача данных сторонним сервисам",paragraphs:[
"Telegram. Если пользователь выбирает вход или регистрацию через Telegram, сервис Telegram участвует в подтверждении авторизации и передаёт сведения, необходимые для работы выбранной функции. Взаимодействие с Telegram регулируется также правилами и политикой самого Telegram.",
"Встроенный видеоплеер. На сайте может отображаться встроенный внешний видеоплеер. При его загрузке или использовании браузер пользователя взаимодействует с сервисом, предоставляющим плеер. Такой сервис может самостоятельно получать технические сведения и обрабатывать их по собственным правилам. YUME не управляет внутренней работой такого плеера и не определяет его способы обработки данных.",
"YUME не продаёт персональные данные пользователей и не передаёт их третьим лицам для самостоятельной рекламной рассылки."
]},
{title:"5. Хранение и защита данных",paragraphs:[
"Данные используются и хранятся столько времени, сколько необходимо для целей, описанных в этой Политике, работы аккаунта и его функций, обеспечения безопасности и обработки обращений.",
"YUME принимает разумные меры для защиты информации от случайного или неправомерного доступа, изменения, утраты и раскрытия. Доступ к данным предоставляется только в объёме, необходимом для работы и поддержки сервиса.",
"Пользователь может удалить аккаунт через соответствующий раздел профиля. При удалении аккаунта удаляются аккаунт YUME, связанные с ним сессии, избранное, список «Буду смотреть», история просмотра, настройки и другие связанные с аккаунтом данные, доступные YUME для удаления в рамках этой функции. Удаление аккаунта YUME не удаляет аккаунт пользователя в Telegram.",
"После удаления аккаунта пользовательские данные, связанные с ним, больше не используются для предоставления функций аккаунта. Технические сведения, которые не относятся к удаляемому аккаунту и необходимы для работы или безопасности сайта, могут обрабатываться отдельно в пределах целей, указанных в Политике."
]},
{title:"6. Внешний видеоплеер и ограничения",paragraphs:[
"Если пользователь запускает встроенный внешний видеоплеер, его работа, содержание, доступность материалов и внутренние правила обработки данных зависят от поставщика плеера, а не от YUME.",
"YUME не гарантирует постоянную доступность внешнего плеера, конкретного видеоматериала или бесперебойное воспроизведение. Сбой или изменение работы внешнего сервиса может повлиять на доступность соответствующей функции.",
"Передача данных через интернет и хранение информации в электронном виде не могут быть абсолютно защищены от всех возможных рисков. YUME принимает разумные меры защиты, но не может гарантировать абсолютную безопасность."
]},
{title:"7. Изменение Политики",paragraphs:[
"Политика может обновляться при изменении функций YUME, состава обрабатываемых данных или способов использования сайта.",
"Актуальная редакция всегда размещается на странице: " + POLICY_URL + ". Дата последнего редактирования указывается в начале документа.",
"Если изменения затрагивают выбор пользователя в отношении cookie-файлов или других необязательных технологий, сайт может повторно показать уведомление, чтобы пользователь мог сделать выбор."
]},
{title:"8. Контакты",paragraphs:[
"По вопросам конфиденциальности, обработки данных, работы аккаунта и удаления связанных с ним данных можно обратиться в поддержку YUME.",
"Электронная почта: yumesupport833@gmail.com.",
"Telegram-поддержка: https://t.me/YumeSupport."
]}
];

const POLICY_EN: PolicySection[] = [
{title:"1. General provisions",paragraphs:[
"This Privacy Policy describes what information YUME receives and uses when visitors browse the site, create or use an account, and interact with available service features.",
"YUME is available at https://yume-website.yumesupport833.workers.dev/. The site provides an anime catalog, personal lists, account features, and other functions made available to users.",
"This Policy covers information users provide, information sent when using an account, and technical information generated when requests are made to the site. Embedded external services may process information independently as part of their operation.",
"YUME does not ask users for their Telegram password, bank card details, or payment credentials. Account registration and sign-in are provided through Telegram."
]},
{title:"2. Information processed",paragraphs:[
"Account information. When a user authenticates through Telegram, YUME may receive a Telegram ID, first and last name, username, interface language, and other profile details if Telegram supplies them during authentication. This information is used to identify the account and provide its features.",
"Session information. Technical session data may be used to maintain sign-in, confirm that a user is authenticated, and protect account access.",
"Site activity. Depending on the features used, YUME may store Favorites, Watch Later items, viewing history, notification settings, and other preferences selected by the user.",
"Technical information. When a user accesses the site, technical information required to deliver pages and operate the service may be transmitted automatically. This may include IP address, request date and time, requested page address, browser type and version, device and operating system details, browser language, technical identifiers, and error information.",
"Cookies and similar technologies. These may be used to remember the user's choice, maintain a session, save preferences, and support site features. The available choices are described in Section 3.",
"YUME does not collect payment details or process payments on the site. An email address is not required to create an account. User ratings and comments are not requested."
]},
{title:"3. How information is used and cookie choices",paragraphs:[
"Information is used to provide access to the site and account, save Favorites and Watch Later lists, display viewing history, operate notification settings, maintain user sessions, protect the site, prevent abuse, diagnose technical errors, and respond to support requests.",
"A notice with two choices is displayed on the first visit. Selecting “Accept all” records consent to the use of the site's available cookies and optional technologies. Selecting “Reject all” records a refusal: optional cookies and similar technologies should not be enabled.",
"After rejection, YUME does not start optional technologies that require consent. However, accessing a website technically requires minimal request data to be transmitted, and session information necessary for features explicitly requested by the user may still be used. Rejecting optional cookies cannot prevent an IP address and other technical information required to deliver an internet request from being transmitted.",
"The choice is saved in the browser so the notice does not appear on every visit. It can be changed at any time using the “Change cookie choice” link on this Policy page. Users can also delete cookies and local browser data in their browser settings, although some preferences and features may then reset."
]},
{title:"4. Sharing with third-party services",paragraphs:[
"Telegram. If a user chooses to sign in or register through Telegram, Telegram participates in authentication and provides information required for the selected feature. Use of Telegram is also subject to Telegram's own terms and privacy policy.",
"Embedded video player. The site may display an embedded external video player. When it loads or is used, the user's browser communicates with the service that provides the player. That service may independently receive technical information and process it under its own rules. YUME does not control the player's internal operation or determine its data-processing practices.",
"YUME does not sell users' personal information or provide it to third parties for their own advertising mailings."
]},
{title:"5. Storage and protection",paragraphs:[
"Information is used and retained for as long as necessary for the purposes described in this Policy, account operation, security, and handling support requests.",
"YUME takes reasonable measures to protect information against accidental or unauthorized access, alteration, loss, and disclosure. Access is limited to what is needed to operate and support the service.",
"Users can delete their account through the relevant section of their profile. Account deletion removes the YUME account, associated sessions, Favorites, Watch Later list, viewing history, settings, and other account-linked information that YUME can delete through this feature. Deleting a YUME account does not delete the user's Telegram account.",
"After account deletion, account-linked information is no longer used to provide account features. Technical information that is not part of the account and is needed to operate or secure the site may be processed separately for the purposes described in this Policy."
]},
{title:"6. External video player and limitations",paragraphs:[
"If a user starts an embedded external video player, its operation, content, material availability, and internal data-processing rules are determined by the player provider, not YUME.",
"YUME does not guarantee continuous availability of an external player, a particular video, or uninterrupted playback. An outage or change by the external service may affect the feature.",
"Internet transmission and electronic storage cannot be guaranteed to be completely secure against every possible risk. YUME takes reasonable protective measures but cannot guarantee absolute security."
]},
{title:"7. Changes to this Policy",paragraphs:[
"This Policy may be updated when YUME features, the information processed, or the ways the site is used change.",
"The current version is always published at: " + POLICY_URL + ". The date of the latest edit appears at the beginning of the document.",
"If changes affect users' choices about cookies or other optional technologies, the site may display the notice again so users can make a choice."
]},
{title:"8. Contact",paragraphs:[
"For privacy questions, information processing, account operation, or deletion of account-linked information, contact YUME support.",
"Email: yumesupport833@gmail.com.",
"Telegram support: https://t.me/YumeSupport."
]}
];

export function PrivacyPolicy() {
 const { language } = useYumePreferences();
 const isRu = language === "ru";
 const sections = isRu ? POLICY_RU : POLICY_EN;
 return (
  <article className="max-w-3xl space-y-6 rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
   <header className="space-y-2">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{isRu ? "Документ YUME" : "YUME document"}</p>
    <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{isRu ? "Политика конфиденциальности" : "Privacy Policy"}</h2>
    <p className="text-sm font-medium text-muted-foreground">{isRu ? `Дата последнего редактирования: ${POLICY_DATE_RU}` : `Last updated: ${POLICY_DATE_EN}`}</p>
   </header>
   <div className="h-px w-full bg-border" />
   {sections.map(section => (
    <section key={section.title} className="space-y-3">
     <h3 className="text-base font-bold text-foreground sm:text-lg">{section.title}</h3>
     <div className="space-y-3">
      {section.paragraphs.map((paragraph,index) => <p key={index} className="text-sm leading-7 text-foreground/85 sm:text-[15px]">{paragraph}</p>)}
     </div>
    </section>
   ))}
   <div className="h-px w-full bg-border" />
   <div className="space-y-3 text-sm">
    <p className="text-foreground/85">{isRu ? "Электронная почта: " : "Email: "}<a className="font-semibold text-primary underline underline-offset-4" href="mailto:yumesupport833@gmail.com">yumesupport833@gmail.com</a></p>
    <p className="text-foreground/85">{isRu ? "Telegram-поддержка: " : "Telegram support: "}<a className="font-semibold text-primary underline underline-offset-4" href="https://t.me/YumeSupport" target="_blank" rel="noreferrer">t.me/YumeSupport</a></p>
   </div>
   <button type="button" className="text-sm font-semibold text-primary underline underline-offset-4" onClick={() => window.dispatchEvent(new Event("yume-open-cookie-consent"))}>
    {isRu ? "Изменить выбор cookie" : "Change cookie choice"}
   </button>
  </article>
 );
}
