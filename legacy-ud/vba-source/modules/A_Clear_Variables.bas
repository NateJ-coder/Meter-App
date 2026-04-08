Attribute VB_Name = "A_Clear_Variables"
Sub ClearData()

    Erase PercentageQuotes
    Erase UnitNames
    Erase ElecThisReadings
    Erase ElecPrevReadings
    Erase ElecUnitCons
    
    Erase ElecBulkDiff
    Erase OptionCharge2
    Erase OptionCharge3
    Erase WaterBulkDiff
    Erase OptionCharge5
    Erase OptionCharge6
    Erase OptionCharge7
    Erase OptionCharge8
    
    Erase WaterThisReadings
    Erase WaterPrevReadings
    Erase WaterUnitCons
    
    ElecTotalCon = 0
    ElecBulkTotCon = 0
    ElecUnitTotCon = 0
        
    WaterTotalCon = 0
    WaterBulkTotCon = 0
    WaterUnitTotCon = 0
    
    ElecUnitCount = 0
    ElecComCount = 0
    ElecBulkCount = 0
    
    WaterUnitCount = 0
    WaterComCount = 0
    WaterBulkCount = 0
    
    TotalUnitCount = 0
    ChargeableUnitCount = 0
    
    ElecActualTotCon = 0
    WaterActualTotCon = 0
    
    ElecSurcharge = 0
    WaterSurcharge = 0
    SanAmount = 0
    RefuseAmount = 0
    
    ElecActualPortion = 0
    WaterActualPortion = 0
    WaterDifference = 0
    ElecDifference = 0
    
    '  NEW
    ElecBulkTotCharge = 0
    ElecActualTotCharge = 0
    
    WaterBulkTotCharge = 0
    WaterActualTotCharge = 0
  
    
    
    
    
End Sub
