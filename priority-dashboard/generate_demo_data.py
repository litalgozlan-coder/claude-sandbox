import json, random, math, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
random.seed(42)
TODAY = dt.date(2026,10,1)
PMS = ["דנה כהן","יוסי לוי","רונית אברהם","אבי מזרחי","מיכל שמעוני"]
PROJ = [
 ("שיפוץ מבנה משרדים","אלון נכסים","בנייה"),
 ("הקמת מערכת מיזוג","מרכז רפואי השרון","מערכות"),
 ("פריסת רשת תקשורת","עיריית גבעת אורנים","תקשורת"),
 ("החלפת לוחות חשמל","תעשיות גליל","חשמל"),
 ("תכנון מבנה ציבור","מועצה אזורית עמק הגפן","תכנון"),
 ("התקנת מערכת סולארית","חקלאות הדרום","אנרגיה"),
 ("שדרוג מערכות מחשוב","רשת מרכולים צפון","מחשוב"),
 ("תחזוקה שנתית למבנים","אופק ניהול נכסים","תחזוקה"),
 ("הקמת מרכז לוגיסטי","שילוח מהיר","בנייה"),
 ("מערכת גילוי אש","בית ספר תיכון רמות","מערכות"),
 ("חידוש תאורת רחובות","עיריית גבעת אורנים","חשמל"),
 ("מעבר לענן ואבטחת מידע","ביטוח ישיר פלוס","מחשוב"),
]
ACTS = {"בנייה":["תכנון והיתרים","עבודות שלד","רכש חומרים","קבלני משנה","גמר ומסירה"],
        "מערכות":["תכנון","רכש ציוד","התקנה","הרצה ובדיקות"],
        "תקשורת":["סקר ותכנון","רכש ציוד","פריסה","בדיקות ומסירה"],
        "חשמל":["תכנון","רכש ציוד","התקנה","בדיקות ומסירה"],
        "תכנון":["תכנון מוקדם","תכנון מפורט","היתרים","פיקוח עליון"],
        "אנרגיה":["תכנון","רכש פאנלים וממירים","התקנה","חיבור לרשת"],
        "מחשוב":["אפיון","רכש רישיונות וציוד","הטמעה","הדרכה ותמיכה"],
        "תחזוקה":["תכנון שנתי","תחזוקה מונעת","תיקונים","דוחות ובקרה"]}
def S(x): x=max(0,min(1,x)); return x*x*(3-2*x)
def months(a,b):
    out=[]; y,m=a.year,a.month
    while (y,m)<=(b.year,b.month): out.append(f"{y}-{m:02d}"); m+=1; y,m=(y+1,1) if m>12 else (y,m)
    return out
projects=[];acts_rows=[];monthly=[];miles=[];invs=[]
profiles=[(1.04,1.05),(0.86,0.92),(1.0,1.02),(0.97,0.8),(0.93,0.95),(1.02,1.0),(0.78,0.85),(1.05,0.98),(0.95,1.08),(1.01,0.7),(0.99,1.0),(0.9,0.97)]
for i,(name,cust,typ) in enumerate(PROJ):
    pid=f"P-{1001+i}"; pm=PMS[i%5]
    start=dt.date(2025,11,1)+dt.timedelta(days=random.randint(0,240))
    dur=random.randint(240,480); end=start+dt.timedelta(days=dur)
    if i==2: start,end=dt.date(2025,12,1),dt.date(2026,11,15)
    contract=round(random.uniform(500,3200),0)*1000
    plan_margin=random.uniform(.16,.26); budget=round(contract*(1-plan_margin),-3)
    cpi,spi=profiles[i]
    t=(TODAY-start).days/dur
    planned_prog=S(t); prog=min(1,max(0,planned_prog*spi)); earned=prog*budget; actual=earned/cpi if prog>0 else 0
    names=ACTS[typ]; w=[random.uniform(.6,1.4) for _ in names]; ws=sum(w); w=[x/ws for x in w]
    cum=0; a_rows=[]
    for n,wi in zip(names,w):
        ap=max(0,min(1,(prog-cum)/wi)) if wi else 0; cum+=wi
        ab=round(budget*wi,-2); ac=ab*ap/(cpi*random.uniform(.93,1.07)); a_rows.append([n,ab,ac,ap])
    sc=actual/sum(r[2] for r in a_rows) if sum(r[2] for r in a_rows) else 0
    for r in a_rows:
        r[2]=round(r[2]*sc,-2); acts_rows.append({"project":pid,"activity":r[0],"budget":r[1],"actual":r[2],"progress":round(r[3],2)})
    budget=sum(r[1] for r in a_rows); actual=sum(r[2] for r in a_rows)
    # monthly
    ms=months(start,end); prev_p=prev_a=0
    for m in ms:
        y,mo=map(int,m.split("-")); me=(dt.date(y+(mo==12),mo%12+1,1)-dt.timedelta(days=1))
        tt=min(1,(me-start).days/dur); pc=budget*S(tt)
        row={"project":pid,"month":m,"planned":round(pc-prev_p,-2)}; prev_p=pc
        if me<=TODAY or (y,mo)==(TODAY.year,TODAY.month-1):
            ac=actual*S(min(1,(me-start).days/dur))/max(S(t),1e-6) if me<TODAY else actual
            ac=min(ac,actual); row["actual"]=round(max(0,ac-prev_a)*random.uniform(.9,1.1),-2); prev_a+=row["actual"]
        monthly.append(row)
    # fix last actual month so sums match
    act_m=[r for r in monthly if r["project"]==pid and "actual" in r]
    if act_m: act_m[-1]["actual"]=round(act_m[-1]["actual"]+actual-sum(r["actual"] for r in act_m),-2)
    # milestones
    k=random.choice([3,4,4,5]); shares=[random.uniform(.7,1.3) for _ in range(k)]; ss=sum(shares)
    cp=0; invoiced=0
    for j in range(k):
        cp+=shares[j]/ss; due=start+dt.timedelta(days=int(dur*cp)); amt=round(contract*shares[j]/ss,-3)
        done=prog>=cp-1e-9
        delay=int((1/spi-1)*dur*cp) if spi<1 else 0
        actual_date=min(TODAY,due+dt.timedelta(days=max(0,delay+random.randint(-5,10)))) if done else None
        mname=["מקדמה ותכנון","השלמת שלב א'","השלמת שלב ב'","השלמת שלב ג'","מסירה סופית"][j] if k==5 else (["מקדמה ותכנון","השלמת שלב א'","השלמת שלב ב'","מסירה סופית"][j] if k==4 else ["מקדמה","השלמת ביצוע","מסירה סופית"][j])
        miles.append({"project":pid,"milestone":mname,"due":due.isoformat(),"done":actual_date.isoformat() if actual_date else None,"amount":amt})
        if done:
            inv_date=actual_date+dt.timedelta(days=random.randint(2,20))
            if inv_date<=TODAY:
                pay_due=inv_date+dt.timedelta(days=60)
                paid = pay_due<TODAY-dt.timedelta(days=random.randint(-30,45)) and random.random()<.85
                paid_date=(pay_due+dt.timedelta(days=random.randint(-10,20))) if paid else None
                if paid_date and paid_date>TODAY: paid_date=None
                invs.append({"invoice":f"IV26{len(invs)+101:04d}","project":pid,"date":inv_date.isoformat(),"due":pay_due.isoformat(),"amount":amt,"paid":paid_date.isoformat() if paid_date else None})
                invoiced+=amt
    projects.append({"id":pid,"name":name,"customer":cust,"type":typ,"pm":pm,"status":"הושלם" if prog>=1 else "פעיל","start":start.isoformat(),"end":end.isoformat(),
        "contract":contract,"budget":budget,"actual":actual,"progress":round(prog,2),"invoiced":invoiced})
data={"updated":"2026-10-01T08:00","today":TODAY.isoformat(),"projects":projects,"activities":acts_rows,"monthly":monthly,"milestones":miles,"invoices":invs}
json.dump(data,open("data.json","w"),ensure_ascii=False)
# Excel
wb=Workbook(); hdr=Font(bold=True,color="FFFFFF"); fill=PatternFill("solid",fgColor="1F4E79")
def sheet(title,cols,rows,first=False):
    ws=wb.active if first else wb.create_sheet()
    ws.title=title; ws.sheet_view.rightToLeft=True
    ws.append([c[0] for c in cols])
    for c in ws[1]: c.font=hdr; c.fill=fill; c.alignment=Alignment(horizontal="center")
    for r in rows: ws.append([c[1](r) for c in cols])
    for i,c in enumerate(cols): ws.column_dimensions[chr(65+i)].width=max(12,len(c[0])+6)
    ws.freeze_panes="A2"
D=lambda s: dt.date.fromisoformat(s) if s else None
sheet("פרויקטים",[("מספר פרויקט",lambda r:r["id"]),("תיאור",lambda r:r["name"]),("לקוח",lambda r:r["customer"]),("סוג",lambda r:r["type"]),("מנהל פרויקט",lambda r:r["pm"]),("סטטוס",lambda r:r["status"]),("תאריך התחלה",lambda r:D(r["start"])),("תאריך סיום מתוכנן",lambda r:D(r["end"])),("ערך חוזה",lambda r:r["contract"]),("תקציב",lambda r:r["budget"]),("עלות בפועל",lambda r:r["actual"]),("% ביצוע",lambda r:r["progress"]),("סכום שחויב",lambda r:r["invoiced"])],projects,True)
sheet("פעילויות",[("מספר פרויקט",lambda r:r["project"]),("פעילות",lambda r:r["activity"]),("תקציב",lambda r:r["budget"]),("עלות בפועל",lambda r:r["actual"]),("% ביצוע",lambda r:r["progress"])],acts_rows)
sheet("עלויות חודשיות",[("מספר פרויקט",lambda r:r["project"]),("חודש",lambda r:r["month"]),("עלות מתוכננת",lambda r:r["planned"]),("עלות בפועל",lambda r:r.get("actual"))],monthly)
sheet("אבני דרך",[("מספר פרויקט",lambda r:r["project"]),("אבן דרך",lambda r:r["milestone"]),("תאריך יעד",lambda r:D(r["due"])),("תאריך השלמה",lambda r:D(r["done"])),("סכום לחיוב",lambda r:r["amount"])],miles)
sheet("חשבוניות",[("מספר חשבונית",lambda r:r["invoice"]),("מספר פרויקט",lambda r:r["project"]),("תאריך",lambda r:D(r["date"])),("תאריך פירעון",lambda r:D(r["due"])),("סכום",lambda r:r["amount"]),("תאריך תשלום",lambda r:D(r["paid"]))],invs)
for ws in wb.worksheets:
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value,(dt.date,)): c.number_format="DD/MM/YYYY"
            elif isinstance(c.value,float) and c.value<=1 and ws.cell(1,c.column).value.startswith("%"): c.number_format="0%"
            elif isinstance(c.value,(int,float)): c.number_format="#,##0"
wb.save("priority-dashboard/נתוני-דמה-פרויקטים.xlsx")
for p in projects:
    eac=p["actual"]/p["progress"] if p["progress"] else p["budget"]
    print(p["id"],p["pm"],p["start"],p["end"],int(p["contract"]),int(p["budget"]),int(p["actual"]),p["progress"],int(p["invoiced"]),f'eac/b={eac/p["budget"]:.2f}',f'm={(p["contract"]-eac)/p["contract"]:.2f}')
print(len(acts_rows),len(monthly),len(miles),len(invs))
