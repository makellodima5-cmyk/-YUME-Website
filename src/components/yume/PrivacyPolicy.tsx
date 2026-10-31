import { useYumePreferences } from "@/data/preferences";

const POLICY_DATE_RU = "31 октября 2026 года";
const POLICY_DATE_EN = "October 31, 2026";
const POLICY_URL = "https://yume-website.yumesupport833.workers.dev/?section=privacy-policy";

type PolicyBlock = { type: "p"; text: string } | { type: "list"; items: string[] };
type PolicySection = { title: string; blocks: PolicyBlock[] };
const p = (text: string): PolicyBlock => ({ type: "p", text });
const list = (...items: string[]): PolicyBlock => ({ type: "list", items });

const POLICY_RU_INTRO = [
  "Настоящая Политика регулирует сбор, использование, хранение и защиту информации пользователей сервиса YUME — сайта https://yume-website.yumesupport833.workers.dev.",
  "YUME может обрабатывать данные аккаунта, техническую информацию, настройки и историю взаимодействий с Сервисом. Эти сведения используются для обеспечения работы сайта, предоставления его функций, поддержания безопасности и связи с Пользователями.",
  "Передача информации третьим лицам осуществляется только в случаях, предусмотренных настоящей Политикой, необходимых для работы отдельных функций Сервиса либо в установленных случаях.",
];

const POLICY_RU: PolicySection[] = [
  { title: "1. Общие положения", blocks: [
    p("1.1. Настоящая Политика конфиденциальности (далее — «Политика») регулирует порядок обработки и защиты информации, которую Пользователь предоставляет или которая может собираться при использовании сайта YUME (далее — «Сервис»)."),
    p("1.2. Используя Сервис, Пользователь подтверждает, что ознакомился с условиями настоящей Политики и принимает их. Если Пользователь не согласен с условиями Политики, он обязан прекратить использование Сервиса."),
    p("1.3. Политика распространяется на информацию, получаемую при посещении сайта, авторизации через Telegram, использовании личного профиля и других доступных функций YUME."),
  ]},
  { title: "2. Сбор информации", blocks: [
    p("2.1. При использовании Сервиса могут собираться и обрабатываться следующие сведения:"),
    list("Данные аккаунта: Telegram ID, имя, фамилия, имя пользователя и языковые настройки, передаваемые при авторизации через Telegram.","Техническая информация: IP-адрес, сведения о браузере, устройстве и операционной системе, дата и время обращения к Сервису, технические данные запросов, а также cookie-файлы и аналогичные технологии.","Информация о взаимодействии с Сервисом: сведения об избранных тайтлах, списке «Смотреть позже», истории просмотров, настройках профиля и взаимодействии с уведомлениями.","Данные сеанса: технические идентификаторы, необходимые для авторизации, поддержания входа в аккаунт и защиты учётной записи."),
    p("2.2. Сервис не требует от Пользователя паспортных данных, фотографий документов, банковских реквизитов, адреса проживания или иной личной информации, не предусмотренной функциональностью YUME."),
    p("2.3. YUME не собирает пользовательские оценки и комментарии, поскольку соответствующие функции не предусмотрены текущей функциональностью Сервиса."),
    p("2.4. Cookie-файлы и аналогичные технологии"),
    p("Сервис может использовать cookie-файлы и локальное хранилище браузера для сохранения пользовательских настроек, поддержания авторизации, обеспечения безопасности и корректной работы основных функций."),
    p("При первом посещении Сервиса Пользователю отображается уведомление об использовании cookie-файлов и аналогичных технологий. Пользователь может принять предложенные условия либо отказаться от их использования."),
    p("В случае отказа Пользователь должен прекратить использование Сервиса и покинуть сайт."),
    p("Пользователь также может самостоятельно удалить сохранённые данные через настройки своего браузера. Это может привести к сбросу отдельных настроек, завершению сеанса или недоступности некоторых функций."),
  ]},
  { title: "3. Использование информации", blocks: [
    p("3.1. Полученная информация используется исключительно для следующих целей:"),
    list("обеспечения работы Сервиса и его основных функций;","создания, авторизации и обслуживания аккаунта Пользователя;","сохранения избранного, списка «Смотреть позже» и истории просмотров;","предоставления уведомлений и сохранения настроек Пользователя;","обеспечения безопасности аккаунтов и предотвращения злоупотреблений;","выявления и устранения технических ошибок;","обработки обращений Пользователей и взаимодействия со службой поддержки."),
    p("3.2. Администрация не использует полученную информацию для целей, не связанных с работой Сервиса, без соответствующего основания и необходимого информирования Пользователя."),
  ]},
  { title: "4. Передача информации третьим лицам", blocks: [
    p("4.1. Для авторизации и работы аккаунтов YUME использует Telegram. При использовании этой функции осуществляется взаимодействие с Telegram, в рамках которого Сервис получает необходимые сведения профиля Пользователя."),
    p("4.2. При использовании встроенного видеоплеера браузер Пользователя взаимодействует с внешним видеомодулем. Такой модуль работает независимо от YUME. Администрация не управляет его внутренними механизмами, содержимым, доступностью и правилами обработки информации."),
    p("4.3. Администрация не продаёт и не передаёт информацию Пользователей третьим лицам для самостоятельного использования в рекламных или иных посторонних целях."),
    p("4.4. Передача информации также возможна в случаях, когда это необходимо для обеспечения работы запрошенных Пользователем функций Сервиса либо предусмотрено применимыми требованиями."),
  ]},
  { title: "5. Хранение и защита данных", blocks: [
    p("5.1. Информация хранится в течение срока, необходимого для достижения целей её обработки, обеспечения работы Сервиса и предоставления Пользователю доступных функций."),
    p("5.2. Данные аккаунта и связанные с ним сведения хранятся до момента удаления аккаунта Пользователем либо до момента, когда необходимость их дальнейшего хранения отпадает."),
    p("5.3. Пользователь может самостоятельно удалить свой аккаунт в настройках профиля YUME."),
    p("После подтверждения удаления аккаунта удаляются учётная запись YUME и связанные с ней данные, включая:"),
    list("сведения аккаунта, полученные при авторизации через Telegram;","сохранённые сеансы авторизации;","избранные тайтлы;","список «Смотреть позже»;","историю просмотров;","связанные с аккаунтом настройки уведомлений и другие записи профиля."),
    p("Удаление аккаунта YUME не приводит к удалению самого аккаунта Пользователя в Telegram."),
    p("Удаление аккаунта YUME является необратимым. Восстановление удалённых данных не предусмотрено."),
    p("5.4. Администрация принимает разумные технические и организационные меры для защиты информации от неправомерного доступа, изменения, утраты или раскрытия."),
    p("5.5. Несмотря на принимаемые меры, Администрация не гарантирует абсолютную безопасность информации при её передаче и хранении с использованием сети Интернет."),
  ]},
  { title: "6. Отказ от ответственности", blocks: [
    p("6.1. Пользователь понимает, что передача информации через сеть Интернет сопряжена с определёнными рисками, которые не могут быть полностью исключены."),
    p("6.2. Администрация не несёт ответственности за работу внешних сервисов и встроенного видеоплеера, включая их доступность, содержание, качество воспроизведения, технические сбои и правила обработки информации."),
    p("6.3. Администрация не отвечает за утрату или раскрытие информации, произошедшие вследствие действий самого Пользователя, неправомерных действий третьих лиц либо обстоятельств, находящихся вне разумного контроля Администрации."),
  ]},
  { title: "7. Изменения в Политике", blocks: [
    p("7.1. Администрация вправе вносить изменения и дополнения в настоящую Политику при изменении функциональности Сервиса, порядка обработки информации или условий его использования."),
    p("7.2. Актуальная редакция Политики всегда размещается на сайте YUME."),
    p("7.3. Продолжение использования Сервиса после публикации изменений означает согласие Пользователя с новой редакцией Политики."),
  ]},
  { title: "8. Контакты", blocks: [
    p("По вопросам, связанным с использованием Сервиса, обработкой информации и настоящей Политикой, Пользователь может обратиться к Администрации YUME следующими способами:"),
    p("Электронная почта: yumesupport833@gmail.com"),
    p("Telegram службы поддержки: https://t.me/YumeSupport"),
  ]},
];

const POLICY_EN: PolicySection[] = [
  { title: "1. General provisions", blocks: [
    p("1.1. This Privacy Policy (the “Policy”) governs the processing and protection of information provided by the User or collected when using the YUME website (the “Service”)."),
    p("1.2. By using the Service, the User confirms that they have read and accept this Policy. If the User does not agree with it, they must stop using the Service."),
    p("1.3. This Policy applies to information received when visiting the website, signing in through Telegram, using a personal profile, and accessing other available YUME features."),
  ]},
  { title: "2. Information collection", blocks: [
    p("2.1. When using the Service, the following information may be collected and processed:"),
    list("Account data: Telegram ID, first name, last name, username, and language settings transmitted during Telegram authentication.","Technical information: IP address, browser, device and operating system details, date and time of access, technical request data, cookies, and similar technologies.","Service interaction information: Favorites, Watch Later list, viewing history, profile settings, and notification interactions.","Session data: technical identifiers required for authentication, maintaining account sign-in, and protecting the account."),
    p("2.2. The Service does not require passport details, photographs of identity documents, bank details, residential address, or other personal information not required by YUME functionality."),
    p("2.3. YUME does not collect user ratings or comments because these features are not part of the Service's current functionality."),
    p("2.4. Cookies and similar technologies"),
    p("The Service may use cookies and browser local storage to save user preferences, maintain authentication, provide security, and ensure that core features work correctly."),
    p("On the first visit, the User is shown a notice about cookies and similar technologies. The User may accept the proposed terms or refuse their use."),
    p("If the User refuses, they must stop using the Service and leave the website."),
    p("The User may also delete saved data through browser settings. This may reset certain preferences, end a session, or make some features unavailable."),
  ]},
  { title: "3. Use of information", blocks: [
    p("3.1. Information received is used exclusively for the following purposes:"),
    list("operating the Service and its core features;","creating, authenticating, and maintaining the User's account;","saving Favorites, the Watch Later list, and viewing history;","providing notifications and saving User preferences;","protecting accounts and preventing abuse;","detecting and fixing technical errors;","handling User requests and communicating with support."),
    p("3.2. The Administration does not use information for purposes unrelated to operating the Service without an appropriate basis and necessary notice to the User."),
  ]},
  { title: "4. Sharing information with third parties", blocks: [
    p("4.1. YUME uses Telegram for authentication and account operation. When this feature is used, YUME interacts with Telegram and receives the User profile information required for the feature."),
    p("4.2. When the embedded video player is used, the User's browser interacts with an external video module. This module operates independently of YUME. The Administration does not control its internal mechanisms, content, availability, or information-processing rules."),
    p("4.3. The Administration does not sell User information or provide it to third parties for their independent use in advertising or other unrelated purposes."),
    p("4.4. Information may also be transferred when necessary to provide Service features requested by the User or where applicable requirements provide for it."),
  ]},
  { title: "5. Data storage and protection", blocks: [
    p("5.1. Information is stored for the period necessary to achieve its processing purposes, operate the Service, and provide available User features."),
    p("5.2. Account data and related information are stored until the User deletes the account or further storage is no longer necessary."),
    p("5.3. The User may delete their account in the YUME profile settings."),
    p("After account deletion is confirmed, the YUME account and associated data are deleted, including:"),
    list("account information received through Telegram authentication;","saved authentication sessions;","Favorites;","the Watch Later list;","viewing history;","account-linked notification settings and other profile records."),
    p("Deleting a YUME account does not delete the User's Telegram account."),
    p("YUME account deletion is irreversible. Deleted data cannot be restored."),
    p("5.4. The Administration takes reasonable technical and organizational measures to protect information against unauthorized access, alteration, loss, or disclosure."),
    p("5.5. Despite these measures, the Administration does not guarantee absolute security of information during transmission and storage over the Internet."),
  ]},
  { title: "6. Disclaimer", blocks: [
    p("6.1. The User understands that transmitting information over the Internet involves risks that cannot be completely eliminated."),
    p("6.2. The Administration is not responsible for external services or the embedded video player, including their availability, content, playback quality, technical failures, or information-processing rules."),
    p("6.3. The Administration is not responsible for loss or disclosure of information resulting from the User's actions, unlawful actions of third parties, or circumstances beyond its reasonable control."),
  ]},
  { title: "7. Changes to the Policy", blocks: [
    p("7.1. The Administration may amend or supplement this Policy when Service functionality, information-processing procedures, or conditions of use change."),
    p("7.2. The current version of the Policy is always published on the YUME website."),
    p("7.3. Continued use of the Service after changes are published means the User agrees to the new version of the Policy."),
  ]},
  { title: "8. Contacts", blocks: [
    p("For questions about use of the Service, information processing, or this Policy, the User may contact the YUME Administration using the following details:"),
    p("Email: yumesupport833@gmail.com"),
    p("Telegram support: https://t.me/YumeSupport"),
  ]},
];

export function PrivacyPolicy() {
  const { language } = useYumePreferences();
  const isRu = language === "ru";
  const sections = isRu ? POLICY_RU : POLICY_EN;
  const intro = isRu ? POLICY_RU_INTRO : [
    "This Policy governs the collection, use, storage, and protection of information of users of the YUME service, available at https://yume-website.yumesupport833.workers.dev.",
    "YUME may process account data, technical information, preferences, and interaction history. This information is used to operate the website, provide its features, maintain security, and communicate with Users.",
    "Information is transferred to third parties only as described in this Policy, when necessary for individual Service features, or where required.",
  ];
  return (
    <article className="max-w-3xl space-y-6 rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
      <header className="space-y-3">
        <p className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{isRu ? "Политика конфиденциальности" : "Privacy Policy"}</p>
        <p className="text-sm font-medium text-muted-foreground">{isRu ? `Редакция от ${POLICY_DATE_RU}` : `Edition dated ${POLICY_DATE_EN}`}</p>
        <div className="space-y-3">
          {intro.map((paragraph, index) => <p key={index} className="text-sm leading-7 text-foreground/85 sm:text-[15px]">{paragraph}</p>)}
        </div>
      </header>
      <div className="h-px w-full bg-border" />
      {sections.map(section => (
        <section key={section.title} className="space-y-3">
          <h3 className="text-base font-bold text-foreground sm:text-lg">{section.title}</h3>
          {section.blocks.map((block, index) => block.type === "p" ? (
            <p key={index} className="text-sm leading-7 text-foreground/85 sm:text-[15px]">{block.text}</p>
          ) : (
            <ul key={index} className="list-disc space-y-2 pl-6 text-sm leading-7 text-foreground/85 sm:text-[15px]">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ul>
          ))}
        </section>
      ))}
      <div className="h-px w-full bg-border" />
      <div className="space-y-3 text-sm">
        <p className="text-foreground/85">{isRu ? "Электронная почта: " : "Email: "}<a className="font-semibold text-primary underline underline-offset-4" href="mailto:yumesupport833@gmail.com">yumesupport833@gmail.com</a></p>
        <p className="text-foreground/85">{isRu ? "Telegram службы поддержки: " : "Telegram support: "}<a className="font-semibold text-primary underline underline-offset-4" href="https://t.me/YumeSupport" target="_blank" rel="noreferrer">t.me/YumeSupport</a></p>
      </div>
    </article>
  );
}
