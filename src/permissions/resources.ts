import {defineResources, defineMessages} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'

export const resources = defineResources([
  {
    "key": "portal.app.shell",
    "type": "APP",
    "target": {
      "applicationCode": "portal"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.app.shell"
    }
  },
  {
    "key": "portal.page.home",
    "type": "PAGE",
    "target": {
      "route": "/"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.page.home"
    }
  },
  {
    "key": "portal.page.child",
    "type": "PAGE",
    "target": {
      "route": "/xingyuan/:platformKey/*"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.page.child"
    }
  },
  {
    "key": "portal.component.childHost",
    "type": "COMPONENT",
    "target": {
      "component": "WujieChild"
    },
    "access": "INTERNAL",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.component.childHost"
    }
  },
  {
    "key": "portal.button.login",
    "type": "BUTTON",
    "target": {
      "action": "login"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.button.login"
    }
  },
  {
    "key": "portal.button.logout",
    "type": "BUTTON",
    "target": {
      "action": "localLogout"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.button.logout"
    }
  },
  {
    "key": "portal.button.ssoLogout",
    "type": "BUTTON",
    "target": {
      "action": "ssoLogout"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.button.ssoLogout"
    }
  },
  {
    "key": "portal.button.retryChild",
    "type": "BUTTON",
    "target": {
      "action": "retryChildMount"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.button.retryChild"
    }
  },
  {
    "key": "portal.menu.tianquan-shoubing",
    "type": "MENU",
    "target": {
      "route": "/xingyuan/tianquan-shoubing/overview"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.menu.tianquan-shoubing"
    }
  },
  {
    "key": "portal.menu.tianquan-jianshen",
    "type": "MENU",
    "target": {
      "route": "/xingyuan/tianquan-jianshen/iam/roles"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.menu.tianquan-jianshen"
    }
  },
  {
    "key": "portal.menu.yuheng",
    "type": "MENU",
    "target": {
      "route": "/xingyuan/yuheng/dashboard"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.menu.yuheng"
    }
  },
  {
    "key": "portal.menu.tianshu",
    "type": "MENU",
    "target": {
      "route": "/xingyuan/tianshu/registry"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.menu.tianshu"
    }
  },
  {
    "key": "portal.menu.yaoguang",
    "type": "MENU",
    "target": {
      "route": "/xingyuan/yaoguang/knowledge"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.menu.yaoguang"
    }
  },
  {
    "key": "portal.menu.tianji",
    "type": "MENU",
    "target": {
      "route": "/xingyuan/tianji/process-definitions"
    },
    "access": "PUBLIC",
    "i18n": {
      "pageCode": "portal.web.permissions",
      "labelKey": "portal.menu.tianji"
    }
  }
] as const)

export const messages = defineMessages([
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.app.shell",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "shell"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.page.home",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "home"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.page.child",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "child"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.component.childHost",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "childHost"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.button.login",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "login"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.button.logout",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "logout"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.button.ssoLogout",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "ssoLogout"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.button.retryChild",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "retryChild"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.menu.tianquan-shoubing",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "tianquan-shoubing"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.menu.tianquan-jianshen",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "tianquan-jianshen"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.menu.yuheng",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "yuheng"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.menu.tianshu",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "tianshu"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.menu.yaoguang",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "yaoguang"
    }
  },
  {
    "pageCode": "portal.web.permissions",
    "key": "portal.menu.tianji",
    "defaultLocale": "en-US",
    "defaults": {
      "en-US": "tianji"
    }
  }
] as const)
